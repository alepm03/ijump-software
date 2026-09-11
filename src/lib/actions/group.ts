'use server'

/**
 * Group bookings — see docs/reservas/GRUPOS.md
 *
 * A `reservation_groups` row is ONE booking with 1..N participants. Every
 * member is a full participant row: each needs its own waiver (individual QR),
 * its own participant_items (per-person billing), its own seat, instructor and
 * overweight fee. A companion is simply a participant who supplies no phone or
 * email of their own — the organizer holds the group's contact data.
 *
 * Lives in its own file rather than in leads.ts: that module is already long,
 * and every function here is about the group as a unit (seat the whole party
 * or none of it), which is a different invariant from the per-lead actions.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { type DbClient, getDayAvailability } from '@/lib/actions/availability'
import { classifyDate } from '@/lib/availability/availability-engine'
import { clearAutoParticipantItems, syncAutoParticipantItems } from '@/lib/actions/finance'
import { getGroupEventThreshold } from '@/lib/actions/settings'
import { normalizePhone } from '@/lib/phone'
import { todayIso } from '@/lib/utils'
import type {
  Channel,
  DateClass,
  GroupPaymentMode,
  PackageType,
  ReservationSource,
} from '@/types/domain'

/** A companion: the minimum that keeps the manifest and the billing honest. */
export type GroupCompanionInput = {
  fullName: string
  /**
   * Required in practice even though it is nullable here: weight drives the
   * tandem limit, the overweight surcharge and the rig/instructor assignment.
   * Missing it turns the surcharge into a surprise on jump day.
   */
  weight?: number | null
  /** Defaults to the organizer's package when omitted. */
  packageType?: PackageType
  isMinor?: boolean
}

export type CreateGroupLeadInput = {
  // ── Organizer: the only member who supplies contact data ──
  fullName: string
  phone?: string | null
  email?: string | null
  packageType?: PackageType
  weight?: number | null
  isMinor?: boolean
  notes?: string | null
  preferredDate: string
  preferredTime?: string | null
  // ── Booking-level ──
  source?: ReservationSource
  channel?: Channel
  createdBy?: string | null
  companions?: GroupCompanionInput[]
  paymentMode?: GroupPaymentMode
}

export type GroupMemberRef = {
  id: string
  token: string | null
  fullName: string
  isOrganizer: boolean
}

export type CreateGroupLeadResult = {
  error?: string
  groupId?: string
  /** The organizer's lead id — what the bot contract calls `reservationId`. */
  leadId?: string
  token?: string | null
  partySize?: number
  isEvent?: boolean
  members?: GroupMemberRef[]
}

/**
 * Creates a whole booking in one go: the group row plus the organizer and
 * every companion, all sharing the same reservation_group_id and the same
 * preferred date.
 *
 * The participants go in as a SINGLE multi-row insert rather than through
 * createParticipant() in a loop, because a half-created group is an
 * operational problem: the staff would see a party of 4 that is really a
 * party of 2. One statement is one transaction, so the party is either all
 * there or not at all. (createParticipant's extra work — auto-itemization —
 * only applies to participants that already hold a seat; leads have none
 * yet, confirmGroup itemizes them when it assigns one.)
 */
export async function createGroupLead(
  input: CreateGroupLeadInput,
  client?: DbClient
): Promise<CreateGroupLeadResult> {
  const supabase = client ?? (await createClient())

  const companions = input.companions ?? []
  const partySize = companions.length + 1
  const threshold = await getGroupEventThreshold(supabase)
  const isEvent = partySize >= threshold

  const organizerPhone = normalizePhone(input.phone)

  const { data: group, error: groupError } = await supabase
    .from('reservation_groups')
    .insert({
      source: input.source ?? 'DIRECT',
      // Only a real group needs a payer on the row; a solo booking would just
      // repeat its own name and light up the "Grupo" badge for nothing.
      payer_name: companions.length > 0 ? input.fullName : null,
      contact_phone: organizerPhone,
      contact_email: input.email ?? null,
      channel: input.channel ?? 'STAFF',
      created_by: input.createdBy ?? null,
      payment_mode: input.paymentMode ?? 'UNDECIDED',
    })
    .select('id')
    .single()
  if (groupError) return { error: groupError.message }

  const now = new Date().toISOString()
  const base = {
    reservation_group_id: group.id,
    lead_status: 'NEW',
    preferred_date: input.preferredDate,
    channel: input.channel ?? 'STAFF',
    created_by: input.createdBy ?? null,
    // A lead is born "just touched": intake IS the first contact (CRM P0).
    last_contact_at: now,
  }

  const rows = [
    {
      ...base,
      full_name: input.fullName,
      phone: organizerPhone,
      email: input.email ?? null,
      package_type: input.packageType ?? 'SOLO',
      weight: input.weight ?? null,
      notes: input.notes ?? null,
      is_minor: input.isMinor ?? false,
      is_organizer: true,
      // Only the organizer carries the requested hour: it is the whole
      // party's hour, and reservations_assign_group reads it from them.
      preferred_time: input.preferredTime ?? null,
    },
    ...companions.map((c) => ({
      ...base,
      full_name: c.fullName,
      phone: null,
      email: null,
      // Companions inherit the organizer's package unless they picked one.
      package_type: c.packageType ?? input.packageType ?? 'SOLO',
      weight: c.weight ?? null,
      notes: null,
      is_minor: c.isMinor ?? false,
      is_organizer: false,
      preferred_time: null,
    })),
  ]

  const { data: inserted, error: insertError } = await supabase
    .from('participants')
    .insert(rows)
    .select('id, token, full_name, is_organizer')

  if (insertError) {
    // The group row would otherwise linger with no members at all.
    await supabase.from('reservation_groups').delete().eq('id', group.id)
    return { error: insertError.message }
  }

  const members: GroupMemberRef[] = (inserted ?? []).map((p) => ({
    id: p.id,
    token: p.token,
    fullName: p.full_name,
    isOrganizer: p.is_organizer,
  }))
  const organizer = members.find((m) => m.isOrganizer)

  revalidatePath('/', 'layout')
  return {
    groupId: group.id,
    leadId: organizer?.id,
    token: organizer?.token ?? null,
    partySize,
    isEvent,
    members,
  }
}

/** Members of a group that still need a seat, in seating order. */
async function pendingMembers(
  supabase: DbClient,
  groupId: string
): Promise<{ id: string; package_type: PackageType }[]> {
  const { data } = await supabase
    .from('participants')
    .select('id, package_type, is_organizer, created_at')
    .eq('reservation_group_id', groupId)
    .is('flight_id', null)
    .not('lead_status', 'eq', 'CANCELLED')
    .not('operational_status', 'in', '(CANCELLED,NO_SHOW,WEATHER_CANCELLED)')
    .order('is_organizer', { ascending: false })
    .order('created_at', { ascending: true })
  return (data ?? []).map((p) => ({ id: p.id, package_type: p.package_type }))
}

export type ConfirmGroupResult = {
  error?: string
  classification?: DateClass
  /** Seats actually assigned — empty on the TENTATIVE and failure paths. */
  seated?: { participantId: string; flightId: string; confirmedTime: string | null }[]
  /**
   * True when the date itself is open but cannot take a party this size.
   * Distinct from a plain UNAVAILABLE so the UI can say "no caben los 4"
   * instead of "día completo", which would be misleading.
   */
  groupDoesNotFit?: boolean
}

/**
 * Confirms an entire booking for `date` — all of it or none of it.
 *
 * Mirrors confirmLead's contract (same classifications, same TENTATIVE
 * parking, same auto-itemization) but delegates seating to
 * reservations_assign_group, which keeps the party in a contiguous block of
 * flights instead of scattering it across the day. With 2 seats per flight a
 * party of 4 cannot share one flight, so "don't split the group" can only
 * mean same day, consecutive flights.
 */
export async function confirmGroup(
  groupId: string,
  date: string,
  client?: DbClient,
  today: string = todayIso()
): Promise<ConfirmGroupResult> {
  const supabase = client ?? (await createClient())

  const members = await pendingMembers(supabase, groupId)
  if (members.length === 0) return { seated: [] }

  const slots = await getDayAvailability(date, supabase)
  const classification = classifyDate(date, today, slots)

  if (classification === 'NOT_OPERATING' || classification === 'UNAVAILABLE') {
    return { classification }
  }

  // The day is open but too tight for this party. Checked before touching
  // anything so the caller gets a precise answer instead of a failed RPC.
  if (classification === 'CONFIRMABLE' && slots.totalFreeSeats < members.length) {
    return { classification: 'UNAVAILABLE', groupDoesNotFit: true }
  }

  if (classification === 'TENTATIVE_ONLY') {
    const { error } = await supabase
      .from('participants')
      .update({
        lead_status: 'TENTATIVE',
        preferred_date: date,
        last_contact_at: new Date().toISOString(),
      })
      .in('id', members.map((m) => m.id))
    if (error) return { error: error.message }
    revalidatePath('/', 'layout')
    return { classification, seated: [] }
  }

  const { data, error } = await supabase.rpc('reservations_assign_group', {
    p_group_id: groupId,
    p_date: date,
  })

  if (error) {
    // The function raises this when no contiguous block fits the party. It
    // seats nobody in that case, so the group is left exactly as it was.
    if (error.message.includes('NO_SEATS_AVAILABLE')) {
      return { classification: 'UNAVAILABLE', groupDoesNotFit: true }
    }
    return { error: error.message }
  }

  // Treasury Sprint 1 — every member now holds a real seat, so generate its
  // participant_items from packageType. Idempotent, and best-effort: a
  // pricing error must not undo a confirmation that already happened.
  for (const member of members) {
    const result = await syncAutoParticipantItems(member.id, member.package_type, supabase)
    if (result.error) {
      console.error('confirmGroup: auto-itemization failed', member.id, result.error)
    }
  }

  revalidatePath('/', 'layout')
  return {
    classification: 'CONFIRMABLE',
    seated: (data ?? []).map((row) => ({
      participantId: row.participant_id,
      flightId: row.flight_id,
      confirmedTime: row.confirmed_time,
    })),
  }
}

/** Every member of the group, cancelled ones included. */
async function allMemberIds(supabase: DbClient, groupId: string): Promise<string[]> {
  const { data } = await supabase
    .from('participants')
    .select('id')
    .eq('reservation_group_id', groupId)
  return (data ?? []).map((p) => p.id)
}

/**
 * Cancels the whole booking. Same semantics as cancelLead applied to every
 * member: the seats go back to the pool and auto-generated items are cleared
 * so a cancelled party never carries phantom revenue.
 */
export async function cancelGroup(groupId: string, client?: DbClient): Promise<{ error?: string }> {
  const supabase = client ?? (await createClient())

  const ids = await allMemberIds(supabase, groupId)
  if (ids.length === 0) return {}

  const { error } = await supabase
    .from('participants')
    .update({ flight_id: null, lead_status: 'CANCELLED' })
    .in('id', ids)
  if (error) return { error: error.message }

  for (const id of ids) {
    const result = await clearAutoParticipantItems(id, supabase)
    if (result.error) {
      console.error('cancelGroup: clearAutoParticipantItems failed', id, result.error)
    }
  }

  revalidatePath('/', 'layout')
  return {}
}

/**
 * Moves the whole booking to another date.
 *
 * Classifies the new date BEFORE releasing anything (the H7 rule from
 * rescheduleLead): if the target cannot take the party, the group keeps the
 * seats it already had instead of being left dangling with none.
 */
export async function rescheduleGroup(
  groupId: string,
  newDate: string,
  time?: string | null
): Promise<ConfirmGroupResult> {
  const supabase = await createClient()

  const { data: membersData } = await supabase
    .from('participants')
    .select('id, is_organizer')
    .eq('reservation_group_id', groupId)
    .not('lead_status', 'eq', 'CANCELLED')
  const members = membersData ?? []
  if (members.length === 0) return { seated: [] }

  const slots = await getDayAvailability(newDate, supabase)
  const classification = classifyDate(newDate, todayIso(), slots)

  if (classification === 'NOT_OPERATING' || classification === 'UNAVAILABLE') {
    return { classification }
  }
  if (classification === 'CONFIRMABLE' && slots.totalFreeSeats < members.length) {
    return { classification: 'UNAVAILABLE', groupDoesNotFit: true }
  }

  const ids = members.map((m) => m.id)
  const organizerId = members.find((m) => m.is_organizer)?.id

  // Release and reset, same as rescheduleLead: a NO_SHOW or cancelled member
  // being rescheduled starts a fresh operational trail on the new date.
  const { error } = await supabase
    .from('participants')
    .update({
      flight_id: null,
      lead_status: 'NEW',
      operational_status: 'PENDING',
      last_contact_at: new Date().toISOString(),
    })
    .in('id', ids)
  if (error) return { error: error.message }

  // The requested hour lives on the organizer — it is the party's hour.
  if (time !== undefined && organizerId) {
    await supabase.from('participants').update({ preferred_time: time }).eq('id', organizerId)
  }

  return confirmGroup(groupId, newDate)
}

/**
 * Adds a companion to an existing booking.
 *
 * If the party is already confirmed, the new member is seated next to it
 * right away: reservations_assign_group only touches members without a seat,
 * so it slots them into the party's own block (or the next flight) instead of
 * re-seating everyone.
 */
export async function addCompanion(
  groupId: string,
  companion: GroupCompanionInput,
  client?: DbClient
): Promise<{ error?: string; participantId?: string }> {
  const supabase = client ?? (await createClient())

  const { data: organizer, error: organizerError } = await supabase
    .from('participants')
    .select('package_type, preferred_date, confirmed_date, channel, lead_status')
    .eq('reservation_group_id', groupId)
    .eq('is_organizer', true)
    .maybeSingle()
  if (organizerError) return { error: organizerError.message }
  if (!organizer) return { error: 'La reserva no tiene organizador' }

  const { data: inserted, error } = await supabase
    .from('participants')
    .insert({
      reservation_group_id: groupId,
      full_name: companion.fullName,
      package_type: companion.packageType ?? organizer.package_type,
      weight: companion.weight ?? null,
      is_minor: companion.isMinor ?? false,
      is_organizer: false,
      lead_status: 'NEW',
      preferred_date: organizer.preferred_date,
      channel: organizer.channel,
      last_contact_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  if (organizer.confirmed_date) {
    const result = await confirmGroup(groupId, organizer.confirmed_date, supabase)
    if (result.error) {
      console.error('addCompanion: seating the new member failed', result.error)
    }
  }

  revalidatePath('/', 'layout')
  return { participantId: inserted.id }
}

/**
 * Drops a companion from the booking.
 *
 * Cancels rather than deletes, like every other lead in this system: the row
 * may already carry payments, a signed waiver or items, and the history is
 * worth more than a tidy table. The organizer can never be removed — promote
 * another member first (the contact data lives on them).
 */
export async function removeCompanion(
  participantId: string,
  client?: DbClient
): Promise<{ error?: string }> {
  const supabase = client ?? (await createClient())

  const { data: member, error: fetchError } = await supabase
    .from('participants')
    .select('is_organizer')
    .eq('id', participantId)
    .single()
  if (fetchError) return { error: fetchError.message }
  if (member.is_organizer) {
    return { error: 'No se puede quitar al organizador: nombra antes a otro miembro' }
  }

  const { error } = await supabase
    .from('participants')
    .update({ flight_id: null, lead_status: 'CANCELLED' })
    .eq('id', participantId)
  if (error) return { error: error.message }

  const cleared = await clearAutoParticipantItems(participantId, supabase)
  if (cleared.error) {
    console.error('removeCompanion: clearAutoParticipantItems failed', cleared.error)
  }

  revalidatePath('/', 'layout')
  return {}
}

/**
 * Hands the organizer role to another member of the same booking.
 *
 * Two statements, not one: the partial unique index allows a single organizer
 * per group, so the outgoing one has to step down first.
 */
export async function promoteToOrganizer(
  participantId: string,
  client?: DbClient
): Promise<{ error?: string }> {
  const supabase = client ?? (await createClient())

  const { data: member, error: fetchError } = await supabase
    .from('participants')
    .select('reservation_group_id')
    .eq('id', participantId)
    .single()
  if (fetchError) return { error: fetchError.message }
  if (!member.reservation_group_id) {
    return { error: 'Este participante no pertenece a ninguna reserva de grupo' }
  }

  const { error: demoteError } = await supabase
    .from('participants')
    .update({ is_organizer: false })
    .eq('reservation_group_id', member.reservation_group_id)
    .eq('is_organizer', true)
  if (demoteError) return { error: demoteError.message }

  const { error: promoteError } = await supabase
    .from('participants')
    .update({ is_organizer: true })
    .eq('id', participantId)
  if (promoteError) return { error: promoteError.message }

  revalidatePath('/', 'layout')
  return {}
}

/** Records what was agreed with the client about who pays. Informative only. */
export async function setGroupPaymentMode(
  groupId: string,
  mode: GroupPaymentMode,
  client?: DbClient
): Promise<{ error?: string }> {
  const supabase = client ?? (await createClient())
  const { error } = await supabase
    .from('reservation_groups')
    .update({ payment_mode: mode })
    .eq('id', groupId)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}
