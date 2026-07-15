'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { FlightStatus } from '@/types/domain'
import { getPolicy } from '@/lib/actions/availability'

/** What to do with a cancelled flight's occupants — see cancelFlight. */
export type CancelFlightDestination =
  | { type: 'existing'; toFlightId: string }
  | { type: 'new'; estimatedDepartureTime: string | null }
  /** Send the occupants back to /reservas to pick a new date (no-show-style circuit). */
  | { type: 'reschedule' }
  /** Definitive cancellation: occupants cancelled with the flight; deposits already collected are kept. */
  | { type: 'cancel' }

export async function createFlight(
  dayId: string,
  data: { estimatedDepartureTime?: string | null }
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { count, error: countError } = await supabase
    .from('flights')
    .select('*', { count: 'exact', head: true })
    .eq('operational_day_id', dayId)

  if (countError) return { error: countError.message }

  const nextIndex = count ?? 0

  const { error } = await supabase.from('flights').insert({
    operational_day_id: dayId,
    flight_number: nextIndex + 1,
    order_index: nextIndex,
    estimated_departure_time: data.estimatedDepartureTime ?? null,
  })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function updateFlight(
  id: string,
  data: {
    status?: FlightStatus
    estimatedDepartureTime?: string | null
    actualDepartureTime?: string | null
    isBackToBack?: boolean
  }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('flights')
    .update({
      ...(data.status && { status: data.status }),
      ...(data.estimatedDepartureTime !== undefined && {
        estimated_departure_time: data.estimatedDepartureTime,
      }),
      ...(data.actualDepartureTime !== undefined && {
        actual_departure_time: data.actualDepartureTime,
      }),
      ...(data.isBackToBack !== undefined && { is_back_to_back: data.isBackToBack }),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

/**
 * Cancels a flight. Its occupants must be resolved first — relocated,
 * sent back to /reservas, or cancelled along with the flight:
 *
 * - No occupants: just mark CANCELLED.
 * - Has occupants + no destination: caller must choose one first.
 * - destination.type === 'new': inserts a fresh flight directly (see below)
 *   then moves everyone into it via reservations_move_participants
 *   (zero-orphans: nobody flying is left pointing at a cancelled flight).
 * - destination.type === 'existing': moves everyone into that flight via
 *   the same RPC, which validates capacity server-side.
 * - destination.type === 'reschedule': same circuit as the weather
 *   cancellation (handleWeatherCancellation) but per flight — occupants go
 *   CANCELLED operationally, leads detach (flight_id NULL) and surface in
 *   the /reservas "Reagendar" tab as RESCHEDULE_NEEDED; auto sale items are
 *   cleared. Walk-ins (never leads) stay attached as CANCELLED.
 * - destination.type === 'cancel': definitive — occupants go CANCELLED
 *   (operational + lead status) but KEEP their flight_id, so any deposit
 *   already collected stays counted in this day's Cobrado and P&L
 *   (non-refundable per the waiver). Auto sale items are cleared.
 *
 * If the move RPC fails (e.g. destination full), the flight is NOT
 * cancelled — the error is returned so the caller can pick another
 * destination or free up room first.
 */
export async function cancelFlight(
  flightId: string,
  destination: CancelFlightDestination | null
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: flight, error: flightError } = await supabase
    .from('flights')
    .select('id, operational_day_id, status')
    .eq('id', flightId)
    .single()
  if (flightError) return { error: flightError.message }
  if (flight.status === 'CANCELLED') return { error: 'El vuelo ya está cancelado' }

  // Any status counts — zero-orphans rule: nobody is left pointing at a
  // cancelled flight, flying or not.
  const { data: occupants, error: occupantsError } = await supabase
    .from('participants')
    .select('id')
    .eq('flight_id', flightId)
  if (occupantsError) return { error: occupantsError.message }

  const occupantIds = (occupants ?? []).map((p) => p.id)

  if (occupantIds.length === 0) {
    const { error } = await supabase.from('flights').update({ status: 'CANCELLED' }).eq('id', flightId)
    if (error) return { error: error.message }
    revalidatePath('/', 'layout')
    return {}
  }

  if (!destination) {
    return { error: 'El vuelo tiene participantes: elige qué hacer con ellos' }
  }

  if (destination.type === 'reschedule' || destination.type === 'cancel') {
    // Both paths cancel the occupants operationally and clear their auto
    // sale items (a jump that won't happen must not carry itemized revenue;
    // payments are untouched — deposits are non-refundable).
    const { error: statusError } = await supabase
      .from('participants')
      .update({ operational_status: 'CANCELLED' })
      .in('id', occupantIds)
    if (statusError) return { error: statusError.message }

    if (destination.type === 'reschedule') {
      // Weather-cancellation circuit, per flight: leads detach and queue up
      // in the /reservas "Reagendar" tab for the staff to rebook.
      const { error: leadError } = await supabase
        .from('participants')
        .update({ flight_id: null, lead_status: 'RESCHEDULE_NEEDED' })
        .in('id', occupantIds)
        .not('lead_status', 'is', null)
      if (leadError) return { error: leadError.message }
    } else {
      // Definitive: lead status closes too. flight_id is kept on purpose —
      // the deposit stays attributed to this day (Cobrado + P&L).
      const { error: leadError } = await supabase
        .from('participants')
        .update({ lead_status: 'CANCELLED' })
        .in('id', occupantIds)
        .not('lead_status', 'is', null)
      if (leadError) return { error: leadError.message }
    }

    // Batched auto-item clear (same pattern as handleWeatherCancellation).
    // Best-effort: statuses are already set; this must not block the cancel.
    const { error: itemsError } = await supabase
      .from('participant_items')
      .delete()
      .in('participant_id', occupantIds)
      .eq('auto_generated', true)
    if (itemsError) {
      console.error('cancelFlight: clearing auto items failed', itemsError.message)
    }

    const { error: cancelError } = await supabase
      .from('flights')
      .update({ status: 'CANCELLED' })
      .eq('id', flightId)
    if (cancelError) return { error: cancelError.message }

    revalidatePath('/', 'layout')
    return {}
  }

  let toFlightId: string
  if (destination.type === 'existing') {
    toFlightId = destination.toFlightId
  } else {
    const policy = await getPolicy(supabase)
    const { count, error: countError } = await supabase
      .from('flights')
      .select('*', { count: 'exact', head: true })
      .eq('operational_day_id', flight.operational_day_id)
    if (countError) return { error: countError.message }
    if ((count ?? 0) >= policy.maxFlightsPerDay) {
      return { error: 'Se alcanzó el máximo de vuelos del día' }
    }

    // Direct insert (not createFlight — it doesn't return the new id and we
    // need it immediately for the move below; keep createFlight untouched
    // for its existing callers). Not atomic with the move/cancel that
    // follow: if reservations_move_participants fails after this insert
    // succeeds, an empty extra flight is left behind. Accepted by design —
    // harmless (no occupants, staff can delete it) and far simpler than
    // wrapping this whole action in a single DB transaction.
    //
    // flight_number = MAX+1, not COUNT+1: flights UNIQUE
    // (operational_day_id, flight_number) and deleted flights leave gaps,
    // so COUNT+1 can collide — the exact failure the 20260626 assign_seat
    // migration hardens against.
    const { data: maxRow, error: maxError } = await supabase
      .from('flights')
      .select('flight_number')
      .eq('operational_day_id', flight.operational_day_id)
      .order('flight_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxError) return { error: maxError.message }
    const nextFlightNumber = (maxRow?.flight_number ?? 0) + 1
    const { data: inserted, error: insertError } = await supabase
      .from('flights')
      .insert({
        operational_day_id: flight.operational_day_id,
        flight_number: nextFlightNumber,
        order_index: nextFlightNumber - 1,
        estimated_departure_time: destination.estimatedDepartureTime ?? null,
      })
      .select('id')
      .single()
    if (insertError) return { error: insertError.message }
    toFlightId = inserted.id
  }

  const { error: moveError } = await supabase.rpc('reservations_move_participants', {
    p_to_flight_id: toFlightId,
    p_participant_ids: occupantIds,
  })
  if (moveError) {
    if (moveError.message.includes('NO_SEATS_AVAILABLE')) {
      return { error: 'El vuelo destino está completo' }
    }
    if (moveError.message.includes('FLIGHT_CANCELLED')) {
      return { error: 'El vuelo destino está cancelado' }
    }
    if (moveError.message.includes('FLIGHT_NOT_FOUND')) {
      return { error: 'El vuelo destino no existe' }
    }
    return { error: moveError.message }
  }

  const { error: cancelError } = await supabase
    .from('flights')
    .update({ status: 'CANCELLED' })
    .eq('id', flightId)
  if (cancelError) return { error: cancelError.message }

  revalidatePath('/', 'layout')
  return {}
}

export async function deleteFlight(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: existing, error: checkError } = await supabase
    .from('participants')
    .select('id')
    .eq('flight_id', id)
    .limit(1)
  if (checkError) return { error: checkError.message }
  if (existing && existing.length > 0) {
    return { error: 'El vuelo tiene participantes — usa "Cancelar vuelo" para reubicarlos' }
  }

  const { error } = await supabase.from('flights').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function reorderFlights(
  orderedIds: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const updates = orderedIds.map((id, index) => ({
    id,
    order_index: index,
    // upsert requires all non-null columns; provide dummy values that will be ignored on conflict
    operational_day_id: '',
    flight_number: 0,
  }))

  // Use individual updates to avoid upsert constraint issues
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('flights').update({ order_index: index }).eq('id', id)
    )
  )

  const firstError = results.find((r) => r.error)
  if (firstError?.error) return { error: firstError.error.message }

  revalidatePath('/', 'layout')
  return {}
}
