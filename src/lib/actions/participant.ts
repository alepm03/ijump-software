'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/lib/supabase/database.types'
import type { Channel, LeadStatus, OperationalStatus, PackageType, ReservationSource } from '@/types/domain'
import type { DbClient } from '@/lib/actions/availability'
import { syncAutoParticipantItems, clearAutoParticipantItems } from '@/lib/actions/finance'
import { normalizePhone } from '@/lib/phone'

/** operational_status values that mean "not actually flying" — see finance.ts clearAutoParticipantItems header. */
const NON_FLYING_STATUSES: ReadonlySet<OperationalStatus> = new Set([
  'CANCELLED',
  'NO_SHOW',
  'WEATHER_CANCELLED',
])

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
  preferredTime: string | null
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
      // CRM P0 — normalize on write so all phone data lands in canonical
      // +<countrycode><number> form (single point of normalization for
      // this write path; see phone.ts header).
      phone: normalizePhone(data.phone),
      email: data.email ?? null,
      // Treasury Sprint 1: this default now also drives auto-itemization
      // (see below) — a caller that omits packageType (e.g. the bot API,
      // where it's optional in the contract) gets billed as SOLO, the base
      // package. Pre-existing default; itemization just makes its effect
      // financially visible where it previously wasn't.
      package_type: data.packageType ?? 'SOLO',
      weight: data.weight ?? null,
      reservation_group_id: resolvedGroupId,
      assigned_instructor_id: data.assignedInstructorId ?? null,
      notes: data.notes ?? null,
      ...(data.leadStatus !== undefined && { lead_status: data.leadStatus }),
      // CRM P0 — a lead is born "just touched": intake IS the first contact.
      // Walk-ins (no leadStatus) don't need aging, so no timestamp for them.
      ...(data.leadStatus !== undefined && { last_contact_at: new Date().toISOString() }),
      ...(data.preferredDate !== undefined && { preferred_date: data.preferredDate }),
      ...(data.preferredTime !== undefined && { preferred_time: data.preferredTime }),
      ...(data.channel !== undefined && { channel: data.channel }),
      ...(data.createdBy !== undefined && { created_by: data.createdBy }),
    })
    .select('id, token')
    .single()
  if (error) return { error: error.message }

  // Treasury Sprint 1 — auto-itemization: only meaningful once the
  // participant is actually on a flight (a lead with flightId null has no
  // seat yet; confirmLead triggers itemization separately once it assigns
  // one). Best-effort: a pricing/catalog error here must not block the
  // manifest add — the staff can still add items by hand from the row.
  if (flightId !== null) {
    const itemsResult = await syncAutoParticipantItems(
      inserted.id,
      data.packageType ?? 'SOLO',
      supabase
    )
    if (itemsResult.error) {
      console.error('createParticipant: auto-itemization failed', itemsResult.error)
    }
  }

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
  // CRM P0 — normalize on write (see createParticipant above).
  if (data.phone !== undefined) update.phone = normalizePhone(data.phone)
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
  if (data.preferredTime !== undefined) update.preferred_time = data.preferredTime || null

  // CRM P0 — editing contact data (name, phone, email, notes, preferred
  // time) means the staff just talked to this person: bump last_contact_at
  // so the lead-aging queue in /reservas resets. Purely operational edits
  // (status, instructor, weight, package...) are NOT contact and must not
  // hide a cold lead from the queue.
  //
  // `notes` is deliberately included: CRM_REVIEW_2026-07.md §4 guardrail 3
  // defines bot->human escalation as "note on the lead + last_contact_at",
  // and a staff note like "called twice, no answer" IS a contact attempt —
  // the queue tracks staff attention, not successful conversations.
  const touchesContact =
    data.fullName !== undefined ||
    data.phone !== undefined ||
    data.email !== undefined ||
    data.notes !== undefined ||
    data.preferredTime !== undefined
  if (touchesContact) update.last_contact_at = new Date().toISOString()

  const { error } = await supabase.from('participants').update(update).eq('id', id)
  if (error) return { error: error.message }

  // CRM no-show circuit — the manifest UI changes operational status through
  // this action too (inline saves), not only updateOperationalStatus.
  if (data.operationalStatus !== undefined) {
    await syncLeadStatusForOperationalChange(supabase, id, data.operationalStatus)
  }

  // Treasury Sprint 1 — keep auto-generated participant_items in sync after
  // any edit made inline from the manifest row (ParticipantRow) that can
  // affect them: packageType change, or operationalStatus crossing the
  // flying/non-flying boundary in either direction.
  //
  // Re-reads the participant's POST-UPDATE state (rather than branching on
  // which fields this particular call happened to pass) so the outcome only
  // depends on where the participant ends up, not on how it got there. This
  // deliberately also covers a caller that changes packageType AND
  // operationalStatus in the same call (the Partial<UpdateParticipantData>
  // type allows it even though today's UI never does), and covers
  // reactivating a previously-cancelled participant back to a flying status
  // (their auto items, cleared on cancellation, must be regenerated —
  // leaving them at zero would silently understate revenue/AR).
  // Best-effort: this must never fail the participant edit itself.
  if (data.operationalStatus !== undefined || data.packageType !== undefined) {
    const { data: current } = await supabase
      .from('participants')
      .select('flight_id, operational_status, package_type')
      .eq('id', id)
      .single()

    if (current) {
      const nowNonFlying = NON_FLYING_STATUSES.has(current.operational_status as OperationalStatus)
      if (nowNonFlying) {
        const clearResult = await clearAutoParticipantItems(id, supabase)
        if (clearResult.error) {
          console.error('updateParticipant: clearAutoParticipantItems failed', clearResult.error)
        }
      } else if (current.flight_id) {
        // Only meaningful once the participant is actually on a flight.
        const itemsResult = await syncAutoParticipantItems(id, current.package_type, supabase)
        if (itemsResult.error) {
          console.error('updateParticipant: auto-itemization sync failed', itemsResult.error)
        }
      }
    }
  }

  revalidatePath('/', 'layout')
  return {}
}

/**
 * Moves one or more participants into `toFlightId`, validating destination
 * capacity server-side via reservations_move_participants (see
 * supabase/migrations/20260703000000_reservations_move_participants.sql).
 * Confirmed leads get confirmed_time realigned to the destination flight's
 * departure time, mirroring reservations_assign_seat.
 */
export async function moveParticipants(
  toFlightId: string,
  participantIds: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reservations_move_participants', {
    p_to_flight_id: toFlightId,
    p_participant_ids: participantIds,
  })
  if (error) {
    if (error.message.includes('NO_SEATS_AVAILABLE')) {
      return { error: 'El vuelo destino está completo' }
    }
    if (error.message.includes('FLIGHT_CANCELLED')) {
      return { error: 'El vuelo destino está cancelado' }
    }
    if (error.message.includes('FLIGHT_NOT_FOUND')) {
      return { error: 'El vuelo destino no existe' }
    }
    return { error: error.message }
  }
  revalidatePath('/', 'layout')
  return {}
}

/**
 * Moves a single participant into `newFlightId`. Reimplemented on top of
 * moveParticipants (RPC-backed): this now validates destination capacity
 * server-side, fixing the drag&drop overbooking bug where a bare UPDATE
 * flight_id had no capacity check at all. Signature unchanged.
 */
export async function moveParticipant(
  id: string,
  newFlightId: string
): Promise<{ error?: string }> {
  return moveParticipants(newFlightId, [id])
}

/**
 * CRM no-show circuit (docs/reservas/CRM_REVIEW_2026-07.md, "NO_SHOW y
 * CANCELLED son agujeros negros"): keeps lead_status in sync with an
 * operational_status change so a no-show surfaces in the /reservas
 * "Reagendar" tab. Only NO_SHOW syncs — operational CANCELLED and
 * WEATHER_CANCELLED already have their own lead flows (cancelLead,
 * handleWeatherCancellation). Reverting NO_SHOW to a flying status
 * restores CONFIRMED (the participant did show after all); reverting to
 * another non-flying status leaves lead_status alone.
 *
 * Walk-ins (participants created directly in the manifest, lead_status
 * NULL) are PROMOTED to lead on NO_SHOW — rescheduling-v2: every no-show
 * must surface in the Reagendar tab, not only the ones that entered
 * through /reservas. Their preferred_date is seeded from the missed
 * flight's day so the tab shows which date they lost.
 *
 * Best-effort by design (errors logged, never returned): callers invoke it
 * after their primary operational_status update has already succeeded.
 */
async function syncLeadStatusForOperationalChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  status: OperationalStatus
): Promise<void> {
  if (status === 'NO_SHOW') {
    const { data: row, error: fetchError } = await supabase
      .from('participants')
      .select('lead_status, preferred_date, flight:flights(operational_day:operational_days(date))')
      .eq('id', id)
      .single()
    if (fetchError || !row) {
      console.error('syncLeadStatusForOperationalChange: NO_SHOW fetch failed', fetchError?.message)
      return
    }

    const missedDate =
      (row.flight as { operational_day: { date: string } | null } | null)?.operational_day?.date ??
      null

    const { error } = await supabase
      .from('participants')
      .update({
        lead_status: 'NO_SHOW',
        // Walk-in promotion: give them the missed day as reference date.
        ...(row.lead_status === null && !row.preferred_date && missedDate
          ? { preferred_date: missedDate }
          : {}),
      })
      .eq('id', id)
    if (error) {
      console.error('syncLeadStatusForOperationalChange: NO_SHOW sync failed', error.message)
    }
  } else if (!NON_FLYING_STATUSES.has(status)) {
    const { error } = await supabase
      .from('participants')
      .update({ lead_status: 'CONFIRMED' })
      .eq('id', id)
      .eq('lead_status', 'NO_SHOW')
    if (error) {
      console.error('syncLeadStatusForOperationalChange: NO_SHOW revert failed', error.message)
    }
  }
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

  await syncLeadStatusForOperationalChange(supabase, id, status)

  // Treasury Sprint 1 — see updateParticipant for the full rule (this
  // mirrors it: clear on non-flying, re-sync on reactivation to flying).
  if (NON_FLYING_STATUSES.has(status)) {
    const clearResult = await clearAutoParticipantItems(id, supabase)
    if (clearResult.error) {
      console.error('updateOperationalStatus: clearAutoParticipantItems failed', clearResult.error)
    }
  } else {
    const { data: current } = await supabase
      .from('participants')
      .select('flight_id, package_type')
      .eq('id', id)
      .single()
    if (current?.flight_id) {
      const itemsResult = await syncAutoParticipantItems(id, current.package_type, supabase)
      if (itemsResult.error) {
        console.error('updateOperationalStatus: auto-itemization sync failed', itemsResult.error)
      }
    }
  }

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
