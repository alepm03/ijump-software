'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/lib/supabase/database.types'
import type { Channel, LeadStatus, OperationalStatus, PackageType, ReservationSource } from '@/types/domain'
import type { DbClient } from '@/lib/actions/availability'

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
  // Reservations module — only meaningful when flightId is null (a lead)
  leadStatus?: LeadStatus
  preferredDate?: string | null
  preferredTime?: string | null
  channel?: Channel
  createdBy?: string | null
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
  flightId: string | null,
  data: CreateParticipantData,
  client?: DbClient
): Promise<{ error?: string; id?: string; token?: string | null }> {
  const supabase = client ?? (await createClient())

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

  const { data: inserted, error } = await supabase
    .from('participants')
    .insert({
      flight_id: flightId,
      full_name: data.fullName,
      phone: data.phone ?? null,
      email: data.email ?? null,
      package_type: data.packageType ?? 'SOLO',
      weight: data.weight ?? null,
      reservation_group_id: resolvedGroupId,
      assigned_instructor_id: data.assignedInstructorId ?? null,
      notes: data.notes ?? null,
      ...(data.leadStatus !== undefined && { lead_status: data.leadStatus }),
      ...(data.preferredDate !== undefined && { preferred_date: data.preferredDate }),
      ...(data.preferredTime !== undefined && { preferred_time: data.preferredTime }),
      ...(data.channel !== undefined && { channel: data.channel }),
      ...(data.createdBy !== undefined && { created_by: data.createdBy }),
    })
    .select('id, token')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { id: inserted.id, token: inserted.token }
}

/** Releases a participant's flight slot (used when rescheduling or freeing a lead). */
export async function freeSeat(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('participants')
    .update({ flight_id: null })
    .eq('id', id)
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
