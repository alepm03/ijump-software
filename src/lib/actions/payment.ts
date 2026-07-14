'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/lib/supabase/database.types'
import type { DailySummary, PaymentMethod, PaymentStage, ReservationSource } from '@/types/domain'

export type CreatePaymentData = {
  amount: number
  method: PaymentMethod
  stage: PaymentStage
  notes?: string | null
}

export async function createPayment(
  participantId: string,
  data: CreatePaymentData
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('payments').insert({
    participant_id: participantId,
    amount: data.amount,
    method: data.method,
    stage: data.stage,
    notes: data.notes ?? null,
  })
  if (error) return { error: error.message }

  // CRM — a registered RESERVA payment IS the deposit: keep deposit_paid
  // (read by the bot API via getLeadByIdOrToken and by the /reservas
  // payment badge) in sync automatically. Best-effort: the payment row is
  // the primary record and is already inserted.
  if (data.stage === 'RESERVA') {
    const { error: depositError } = await supabase
      .from('participants')
      .update({ deposit_paid: true })
      .eq('id', participantId)
    if (depositError) {
      console.error('createPayment: deposit_paid sync failed', depositError.message)
    }
  }

  revalidatePath('/', 'layout')
  return {}
}

export async function updatePayment(
  id: string,
  data: Partial<CreatePaymentData>
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const update: TablesUpdate<'payments'> = {}
  if (data.amount !== undefined) update.amount = data.amount
  if (data.method !== undefined) update.method = data.method
  if (data.stage !== undefined) update.stage = data.stage
  if (data.notes !== undefined) update.notes = data.notes

  const { error } = await supabase.from('payments').update(update).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function deletePayment(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('payments').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

function emptyDailySummary(): DailySummary {
  return {
    totalFlights: 0,
    totalJumps: 0,
    jumpsBySource: {
      DIRECT: 0,
      GROUPON: 0,
      BONO: 0,
      PROMO: 0,
      SMARTBOX: 0,
      WONDERBOX: 0,
      JUMPING: 0,
      FREEDOM: 0,
    },
    handycamCount: 0,
    externalCameraCount: 0,
    overweightCount: 0,
    totalRevenue: 0,
    revenueByMethod: { EFECTIVO: 0, TARJETA: 0, BIZUM: 0, TRANSFERENCIA: 0, GROUPON: 0 },
  }
}

export async function getDailySummary(dayId: string): Promise<DailySummary> {
  const supabase = await createClient()

  const { data: flights, error: flightsError } = await supabase
    .from('flights')
    .select('id, status')
    .eq('operational_day_id', dayId)

  if (flightsError) throw new Error(flightsError.message)
  if (!flights?.length) return emptyDailySummary()

  // Cancelled flights stay out of the "Vuelos" KPI (they never flew) but
  // their ids are still used to fetch participants, so anyone not yet
  // relocated is not silently dropped from the day's numbers.
  const activeFlightCount = flights.filter((f) => f.status !== 'CANCELLED').length
  const flightIds = flights.map((f) => f.id)

  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('id, package_type, overweight_fee, reservation_group_id, operational_status')
    .in('flight_id', flightIds)

  if (participantsError) throw new Error(participantsError.message)
  if (!participants?.length) return { ...emptyDailySummary(), totalFlights: activeFlightCount }

  const activeParticipants = participants.filter(
    (p) => !['CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED'].includes(p.operational_status)
  )

  // "Cobrado" = money actually collected, regardless of who ended up
  // cancelled/no-show (deposits are non-refundable) — so payments are
  // fetched for ALL the day's participants, matching the treasury cash view.
  const participantIds = participants.map((p) => p.id)
  const groupIds = [...new Set(activeParticipants.map((p) => p.reservation_group_id).filter(Boolean))] as string[]

  const [paymentsResult, groupsResult] = await Promise.all([
    participantIds.length
      ? supabase.from('payments').select('amount, method').in('participant_id', participantIds)
      : { data: [], error: null },
    groupIds.length
      ? supabase.from('reservation_groups').select('id, source').in('id', groupIds)
      : { data: [], error: null },
  ])

  if (paymentsResult.error) throw new Error(paymentsResult.error.message)
  if (groupsResult.error) throw new Error(groupsResult.error.message)

  const groupSourceMap = new Map(
    (groupsResult.data ?? []).map((g) => [g.id, g.source as ReservationSource])
  )

  const summary = emptyDailySummary()
  summary.totalFlights = activeFlightCount
  summary.totalJumps = activeParticipants.length

  for (const p of activeParticipants) {
    const source = p.reservation_group_id
      ? (groupSourceMap.get(p.reservation_group_id) ?? 'DIRECT')
      : 'DIRECT'
    summary.jumpsBySource[source as ReservationSource]++

    if (p.package_type === 'HANDYCAM' || p.package_type === 'HANDYCAM_FOTOS') summary.handycamCount++
    if (p.package_type === 'VIDEO_EXTERNO') summary.externalCameraCount++
    if (p.overweight_fee > 0) summary.overweightCount++
  }

  for (const pmt of paymentsResult.data ?? []) {
    summary.totalRevenue += pmt.amount
    summary.revenueByMethod[pmt.method as PaymentMethod] += pmt.amount
  }

  return summary
}
