'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/lib/supabase/database.types'
import type { OperationalStatus, PackageType, ReservationSource } from '@/types/domain'

export type CreateParticipantData = {
  fullName: string
  phone?: string | null
  email?: string | null
  packageType?: PackageType
  weight?: number | null
  reservationGroupId?: string | null
  assignedInstructorId?: string | null
  notes?: string | null
  source?: ReservationSource
  payerName?: string | null
}

export type UpdateParticipantData = Partial<{
  fullName: string
  phone: string | null
  email: string | null
  packageType: PackageType
  weight: number | null
  overweightFee: number
  assignedInstructorId: string | null
  reservationGroupId: string | null
  notes: string | null
  waiverSigned: boolean
  checkInCompleted: boolean
  gearedUp: boolean
  operationalStatus: OperationalStatus
}>

export async function createParticipant(
  flightId: string,
  data: CreateParticipantData
): Promise<{ error?: string }> {
  const supabase = await createClient()

  let resolvedGroupId = data.reservationGroupId ?? null

  if (data.source) {
    const { data: group, error: groupError } = await supabase
      .from('reservation_groups')
      .insert({ source: data.source, payer_name: data.payerName ?? null })
      .select('id')
      .single()
    if (groupError) return { error: groupError.message }
    resolvedGroupId = group.id
  }

  const { error } = await supabase.from('participants').insert({
    flight_id: flightId,
    full_name: data.fullName,
    phone: data.phone ?? null,
    email: data.email ?? null,
    package_type: data.packageType ?? 'SOLO',
    weight: data.weight ?? null,
    reservation_group_id: resolvedGroupId,
    assigned_instructor_id: data.assignedInstructorId ?? null,
    notes: data.notes ?? null,
  })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function updateParticipant(
  id: string,
  data: UpdateParticipantData
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const update: TablesUpdate<'participants'> = {}
  if (data.fullName !== undefined) update.full_name = data.fullName
  if (data.phone !== undefined) update.phone = data.phone
  if (data.email !== undefined) update.email = data.email
  if (data.packageType !== undefined) update.package_type = data.packageType
  if (data.weight !== undefined) update.weight = data.weight
  if (data.overweightFee !== undefined) update.overweight_fee = data.overweightFee
  if (data.assignedInstructorId !== undefined) update.assigned_instructor_id = data.assignedInstructorId
  if (data.reservationGroupId !== undefined) update.reservation_group_id = data.reservationGroupId
  if (data.notes !== undefined) update.notes = data.notes
  if (data.waiverSigned !== undefined) update.waiver_signed = data.waiverSigned
  if (data.checkInCompleted !== undefined) update.check_in_completed = data.checkInCompleted
  if (data.gearedUp !== undefined) update.geared_up = data.gearedUp
  if (data.operationalStatus !== undefined) update.operational_status = data.operationalStatus

  const { error } = await supabase.from('participants').update(update).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function moveParticipant(
  id: string,
  newFlightId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('participants')
    .update({ flight_id: newFlightId })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function updateOperationalStatus(
  id: string,
  status: OperationalStatus
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('participants')
    .update({ operational_status: status })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function deleteParticipant(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('participants').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function swapParticipantFlights(
  idA: string,
  idB: string
): Promise<{ error?: string }> {
  const supabase = await createClient()

  // Read current flight assignments for both participants
  const { data: rows, error: fetchError } = await supabase
    .from('participants')
    .select('id, flight_id')
    .in('id', [idA, idB])

  if (fetchError) return { error: fetchError.message }
  if (!rows || rows.length !== 2) return { error: 'No se encontraron ambos participantes' }

  const a = rows.find((r) => r.id === idA)
  const b = rows.find((r) => r.id === idB)
  if (!a || !b) return { error: 'No se encontraron ambos participantes' }

  // If same flight, swap is a no-op — return success silently
  if (a.flight_id === b.flight_id) {
    return {}
  }

  // Swap: A takes B's flight, B takes A's flight
  const { error: errA } = await supabase
    .from('participants')
    .update({ flight_id: b.flight_id })
    .eq('id', idA)
  if (errA) return { error: errA.message }

  const { error: errB } = await supabase
    .from('participants')
    .update({ flight_id: a.flight_id })
    .eq('id', idB)
  if (errB) return { error: errB.message }

  revalidatePath('/', 'layout')
  return {}
}
