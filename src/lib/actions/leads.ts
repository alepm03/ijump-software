'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createParticipant, freeSeat } from '@/lib/actions/participant'
import { getDayAvailability, type DbClient } from '@/lib/actions/availability'
import { classifyDate } from '@/lib/availability/availability-engine'
import { syncAutoParticipantItems, clearAutoParticipantItems } from '@/lib/actions/finance'
import { normalizePhone } from '@/lib/phone'
import type {
  Channel,
  DateClass,
  LeadStatus,
  LeadWithDetails,
  PackageType,
  ReservationSource,
} from '@/types/domain'

/** Today as YYYY-MM-DD in the center's timezone (Europe/Madrid). */
function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

export type CreateLeadInput = {
  fullName: string
  phone?: string | null
  email?: string | null
  packageType?: PackageType
  weight?: number | null
  notes?: string | null
  source?: ReservationSource
  payerName?: string | null
  reservationGroupId?: string | null
  preferredDate: string
  preferredTime?: string | null
  channel?: Channel
  createdBy?: string | null
}

/** Creates a lead: a participant row with flight_id NULL and lead_status = 'NEW'. */
export async function createLead(
  input: CreateLeadInput,
  client?: DbClient
): Promise<{ error?: string; leadId?: string; token?: string | null }> {
  const result = await createParticipant(
    null,
    {
      fullName: input.fullName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      packageType: input.packageType,
      weight: input.weight ?? null,
      notes: input.notes ?? null,
      source: input.source,
      payerName: input.payerName ?? null,
      reservationGroupId: input.reservationGroupId ?? null,
      leadStatus: 'NEW',
      preferredDate: input.preferredDate,
      preferredTime: input.preferredTime ?? null,
      channel: input.channel ?? 'STAFF',
      createdBy: input.createdBy ?? null,
    },
    client
  )
  if (result.error) return { error: result.error }
  return { leadId: result.id, token: result.token }
}

/** Completes a lead created without a preferred date (e.g. a bare phone inquiry). */
export async function setPreferredDate(
  leadId: string,
  date: string,
  time?: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('participants')
    // CRM P0 — completing the date happens while talking to the client: contact.
    .update({ preferred_date: date, preferred_time: time ?? null, last_contact_at: new Date().toISOString() })
    .eq('id', leadId)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

type ConfirmLeadResult = {
  error?: string
  classification?: DateClass
  flightId?: string
}

/**
 * Confirms a lead for `date`.
 *
 * - CONFIRMABLE   → assigns a real flight via the reservations_assign_seat RPC
 *                    (concurrency-safe: SELECT ... FOR UPDATE inside Postgres).
 * - TENTATIVE_ONLY → the lead is parked as TENTATIVE with preferred_date = date;
 *                    no flight_id is assigned. promoteTentativeLeads() will retry
 *                    once that month arrives.
 * - UNAVAILABLE / NOT_OPERATING → returns the classification so the UI can prompt
 *                    the staff to pick another date (reschedule flow).
 */
export async function confirmLead(
  leadId: string,
  date: string,
  client?: DbClient,
  today: string = todayIso()
): Promise<ConfirmLeadResult> {
  const supabase = client ?? (await createClient())

  const slots = await getDayAvailability(date, client)
  const classification = classifyDate(date, today, slots)

  if (classification === 'NOT_OPERATING' || classification === 'UNAVAILABLE') {
    return { classification }
  }

  if (classification === 'TENTATIVE_ONLY') {
    const { error } = await supabase
      .from('participants')
      // CRM P0 — confirming (even as tentative) is a staff-client contact.
      .update({ lead_status: 'TENTATIVE', preferred_date: date, last_contact_at: new Date().toISOString() })
      .eq('id', leadId)
    if (error) return { error: error.message }
    revalidatePath('/', 'layout')
    return { classification }
  }

  // CONFIRMABLE — hand off to the Postgres function for the concurrency-sensitive part.
  const { data, error } = await supabase
    .rpc('reservations_assign_seat', { p_lead_id: leadId, p_date: date })
    .single()

  if (error) {
    if (error.message.includes('NO_SEATS_AVAILABLE')) {
      return { classification: 'UNAVAILABLE' }
    }
    return { error: error.message }
  }

  // Treasury Sprint 1 — the lead now has a real flight_id: auto-generate its
  // participant_items from packageType (one data entry — already captured
  // at intake, see createLead/AddParticipantDrawer). Idempotent (see
  // syncAutoParticipantItems header) so a retried confirm never duplicates
  // items. Best-effort: a pricing/catalog error must not fail the
  // confirmation itself — the seat is already assigned.
  // CRM P0 — seat assigned means the client was just contacted/confirmed:
  // bump last_contact_at (the RPC itself doesn't know about aging).
  // Best-effort like the itemization below — must not fail the confirmation.
  const { error: contactError } = await supabase
    .from('participants')
    .update({ last_contact_at: new Date().toISOString() })
    .eq('id', leadId)
  if (contactError) {
    console.error('confirmLead: last_contact_at bump failed', contactError.message)
  }

  const { data: leadRow } = await supabase
    .from('participants')
    .select('package_type')
    .eq('id', leadId)
    .single()
  if (leadRow) {
    const itemsResult = await syncAutoParticipantItems(leadId, leadRow.package_type, supabase)
    if (itemsResult.error) {
      console.error('confirmLead: auto-itemization failed', itemsResult.error)
    }
  }

  revalidatePath('/', 'layout')
  return { classification: 'CONFIRMABLE', flightId: data.flight_id }
}

/** Releases the lead's current slot (if any) and re-confirms it for a new date. */
export async function rescheduleLead(leadId: string, newDate: string): Promise<ConfirmLeadResult> {
  await freeSeat(leadId)
  const supabase = await createClient()
  // CRM P0 — a reschedule attempt is a contact even if the new date ends up
  // unavailable (confirmLead bumps it again on the successful paths).
  await supabase
    .from('participants')
    .update({ lead_status: 'NEW', last_contact_at: new Date().toISOString() })
    .eq('id', leadId)
  return confirmLead(leadId, newDate)
}

export type LeadRescheduleAssignment = { leadId: string; date: string }
export type LeadRescheduleOutcome = { leadId: string; classification?: DateClass; error?: string }

/**
 * Sprint 3 E3 — bulk reschedule for a group of leads that shared a weather-cancelled
 * day (handleWeatherCancellation left them lead_status='RESCHEDULE_NEEDED' with
 * preferredDate = the cancelled day). Staff picks a (possibly different) date per
 * lead in GroupRescheduleModal; this applies all of them in one action.
 *
 * Sequential for...of (NOT Promise.all): several leads commonly land on the same
 * new date, and flight-seat assignment must fill deterministically one at a time —
 * concurrent confirmLead calls for the same day would race on seat availability.
 *
 * rescheduleLead sets lead_status='NEW' before attempting to confirm. If the
 * outcome is not a success (error, or classification UNAVAILABLE/NOT_OPERATING),
 * the lead would be left in lead_status='NEW' with no flight — losing its
 * RESCHEDULE_NEEDED badge and silently disappearing from the pending group. So
 * after every non-successful outcome we restore lead_status='RESCHEDULE_NEEDED'
 * for that lead. Success = classification CONFIRMABLE or TENTATIVE_ONLY with no error.
 */
export async function rescheduleLeadsBatch(
  assignments: LeadRescheduleAssignment[]
): Promise<{ results: LeadRescheduleOutcome[] }> {
  const supabase = await createClient()
  const results: LeadRescheduleOutcome[] = []

  for (const { leadId, date } of assignments) {
    try {
      const outcome = await rescheduleLead(leadId, date)
      const success =
        !outcome.error &&
        (outcome.classification === 'CONFIRMABLE' || outcome.classification === 'TENTATIVE_ONLY')

      if (!success) {
        await supabase.from('participants').update({ lead_status: 'RESCHEDULE_NEEDED' }).eq('id', leadId)
      }

      results.push({ leadId, classification: outcome.classification, error: outcome.error })
    } catch (err) {
      await supabase.from('participants').update({ lead_status: 'RESCHEDULE_NEEDED' }).eq('id', leadId)
      results.push({ leadId, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  revalidatePath('/', 'layout')
  return { results }
}

/**
 * Called when an operational day's weather_status is set to CANCELLED.
 * Releases every confirmed participant's seat for that day and marks them
 * RESCHEDULE_NEEDED so they surface in /reservas for the staff to rebook.
 * Participants that were never leads (lead_status NULL, e.g. walk-ins added
 * directly in the manifest) are left with operational_status WEATHER_CANCELLED
 * but are not turned into leads.
 */
export async function handleWeatherCancellation(dayId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: flights, error: flightsError } = await supabase
    .from('flights')
    .select('id')
    .eq('operational_day_id', dayId)
  if (flightsError) return { error: flightsError.message }

  const flightIds = (flights ?? []).map((f) => f.id)
  if (flightIds.length === 0) return {}

  // Treasury Sprint 1 — capture the affected participant ids BEFORE the
  // updates below clear flight_id, so their auto-generated items can be
  // cleared afterwards. Every participant on these flights stops flying
  // today regardless of whether they are a lead or a walk-in, so their
  // itemized revenue must not linger — see pnl-engine.ts: revenueTotal
  // sums ALL participants regardless of operational_status.
  const { data: affectedParticipants, error: affectedError } = await supabase
    .from('participants')
    .select('id')
    .in('flight_id', flightIds)
  if (affectedError) return { error: affectedError.message }
  const affectedIds = (affectedParticipants ?? []).map((p) => p.id)

  const { error } = await supabase
    .from('participants')
    .update({ operational_status: 'WEATHER_CANCELLED' })
    .in('flight_id', flightIds)
  if (error) return { error: error.message }

  const { error: leadError } = await supabase
    .from('participants')
    .update({ flight_id: null, lead_status: 'RESCHEDULE_NEEDED' })
    .in('flight_id', flightIds)
    .not('lead_status', 'is', null)
  if (leadError) return { error: leadError.message }

  // Single batched delete instead of one clearAutoParticipantItems call per
  // participant — same effect (only auto_generated rows), one round-trip.
  if (affectedIds.length > 0) {
    const { error: clearError } = await supabase
      .from('participant_items')
      .delete()
      .in('participant_id', affectedIds)
      .eq('auto_generated', true)
    if (clearError) {
      console.error('handleWeatherCancellation: clearing auto-generated items failed', clearError.message)
    }
  }

  revalidatePath('/', 'layout')
  return {}
}

/**
 * Daily cron target: promotes TENTATIVE leads whose preferred month has arrived.
 * Tries confirmLead for each — on success they become CONFIRMED with a real
 * flight; if the day turned out to be full by the time the month arrived,
 * they are marked RESCHEDULE_NEEDED instead of silently staying TENTATIVE.
 */
export async function promoteTentativeLeads(
  today: string = todayIso(),
  client?: DbClient
): Promise<{ promoted: number; rescheduleNeeded: number; error?: string }> {
  const supabase = client ?? (await createClient())

  const { data: tentativeLeads, error } = await supabase
    .from('participants')
    .select('id, preferred_date')
    .eq('lead_status', 'TENTATIVE')
    .not('preferred_date', 'is', null)

  if (error) return { promoted: 0, rescheduleNeeded: 0, error: error.message }

  const leads = tentativeLeads ?? []
  let promoted = 0
  let rescheduleNeeded = 0

  // No separate "due" date filter here — confirmLead's own classifyDate call
  // is the single source of truth for the CONFIRMABLE_WINDOW_DAYS rolling
  // window. A lead still beyond the window classifies as TENTATIVE_ONLY
  // again (a harmless no-op) and must NOT be marked RESCHEDULE_NEEDED —
  // only a genuinely full/weather-cancelled/non-operating day should.
  for (const lead of leads) {
    const result = await confirmLead(lead.id, lead.preferred_date as string, client, today)
    if (result.classification === 'CONFIRMABLE' && result.flightId) {
      promoted++
    } else if (result.classification !== 'TENTATIVE_ONLY') {
      await supabase
        .from('participants')
        .update({ lead_status: 'RESCHEDULE_NEEDED' })
        .eq('id', lead.id)
      rescheduleNeeded++
    }
  }

  if (leads.length > 0) revalidatePath('/', 'layout')
  return { promoted, rescheduleNeeded }
}

export async function cancelLead(leadId: string, client?: DbClient): Promise<{ error?: string }> {
  const supabase = client ?? (await createClient())
  const { error } = await supabase
    .from('participants')
    .update({ flight_id: null, lead_status: 'CANCELLED' })
    .eq('id', leadId)
  if (error) return { error: error.message }

  // Treasury Sprint 1 — a confirmed lead that gets cancelled may already
  // have auto-generated items (confirmLead itemizes as soon as a seat is
  // assigned). Clear them so a cancelled lead never carries phantom
  // revenue. No-op for leads that were never confirmed (nothing to delete).
  const clearResult = await clearAutoParticipantItems(leadId, supabase)
  if (clearResult.error) {
    console.error('cancelLead: clearAutoParticipantItems failed', clearResult.error)
  }
  revalidatePath('/', 'layout')
  return {}
}

/** Count of leads awaiting staff action (NEW + RESCHEDULE_NEEDED) — used for the sidebar badge. */
export async function countPendingLeads(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .in('lead_status', ['NEW', 'RESCHEDULE_NEEDED'])
  if (error) return 0
  return count ?? 0
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type LeadStatusSummary = {
  id: string
  status: LeadStatus | null
  depositPaid: boolean
  confirmedDate: string | null
  confirmedTime: string | null
  preferredDate: string | null
  packageType: PackageType
  fullName: string
}

/** Looks up a lead by its internal id or its public token — used by GET /api/bot/v1/reservations/{idOrToken}. */
export async function getLeadByIdOrToken(
  idOrToken: string,
  client?: DbClient
): Promise<{ lead?: LeadStatusSummary; error?: string }> {
  if (!UUID_RE.test(idOrToken)) return { error: 'not_found' }

  const supabase = client ?? (await createClient())
  const { data, error } = await supabase
    .from('participants')
    .select('id, lead_status, deposit_paid, confirmed_date, confirmed_time, preferred_date, package_type, full_name')
    .or(`id.eq.${idOrToken},token.eq.${idOrToken}`)
    .not('lead_status', 'is', null)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'not_found' }

  return {
    lead: {
      id: data.id,
      status: data.lead_status as LeadStatus | null,
      depositPaid: data.deposit_paid,
      confirmedDate: data.confirmed_date,
      confirmedTime: data.confirmed_time,
      preferredDate: data.preferred_date,
      packageType: data.package_type,
      fullName: data.full_name,
    },
  }
}

export type LeadFilter = 'pending' | 'confirmed' | 'cancelled'

const STATUSES_BY_FILTER: Record<LeadFilter, LeadStatus[]> = {
  pending: ['NEW', 'TENTATIVE', 'RESCHEDULE_NEEDED'],
  confirmed: ['CONFIRMED'],
  cancelled: ['CANCELLED', 'NO_SHOW'],
}

export async function listLeads(filter: LeadFilter): Promise<{ leads: LeadWithDetails[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('participants')
    .select(
      `*, reservation_group:reservation_groups!participants_reservation_group_id_fkey (*)`
    )
    .in('lead_status', STATUSES_BY_FILTER[filter])
    .order('preferred_date', { ascending: true, nullsFirst: false })

  if (error) return { leads: [], error: error.message }

  const leads: LeadWithDetails[] = (data ?? []).map((p) => ({
    id: p.id,
    reservationGroupId: p.reservation_group_id,
    flightId: p.flight_id,
    fullName: p.full_name,
    phone: p.phone,
    email: p.email,
    packageType: p.package_type,
    weight: p.weight,
    overweightFee: p.overweight_fee,
    operationalStatus: p.operational_status,
    assignedInstructorId: p.assigned_instructor_id,
    waiverSigned: p.waiver_signed,
    checkInCompleted: p.check_in_completed,
    gearedUp: p.geared_up,
    notes: p.notes,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    lastContactAt: p.last_contact_at,
    leadStatus: p.lead_status as LeadStatus | null,
    preferredDate: p.preferred_date,
    preferredTime: p.preferred_time,
    confirmedDate: p.confirmed_date,
    confirmedTime: p.confirmed_time,
    depositPaid: p.deposit_paid,
    channel: p.channel as Channel,
    createdBy: p.created_by,
    token: p.token,
    reservationGroup: p.reservation_group
      ? {
          id: p.reservation_group.id,
          payerName: p.reservation_group.payer_name,
          source: p.reservation_group.source,
          notes: p.reservation_group.notes,
          createdAt: p.reservation_group.created_at,
          contactPhone: p.reservation_group.contact_phone,
          contactEmail: p.reservation_group.contact_email,
          channel: p.reservation_group.channel as Channel,
          createdBy: p.reservation_group.created_by,
        }
      : null,
  }))

  return { leads }
}

// ────────────────────────────────────────────────────────────────────────────
// CRM P0 — phone dedupe (docs/reservas/CRM_REVIEW_2026-07.md §3).
// ────────────────────────────────────────────────────────────────────────────

export type ActiveLeadMatch = {
  id: string
  token: string | null
  fullName: string
  leadStatus: LeadStatus
  preferredDate: string | null
  preferredTime: string | null
  confirmedDate: string | null
  confirmedTime: string | null
}

const ACTIVE_LEAD_STATUSES: LeadStatus[] = ['NEW', 'TENTATIVE', 'CONFIRMED', 'RESCHEDULE_NEEDED']

/**
 * Finds an ACTIVE lead with the same canonical phone number, for duplicate
 * detection: the "possible duplicate" hint in the staff intake form and the
 * idempotency guard in POST /api/bot/v1/reservations (same client calls AND
 * writes to the bot → must not become two leads).
 *
 * "Active" = status NEW/TENTATIVE/CONFIRMED/RESCHEDULE_NEEDED whose relevant
 * date (confirmed, else preferred) is today or later — or with no date at
 * all (a bare phone inquiry is still an active lead). Past-dated leads don't
 * match: a returning customer next season is a new reservation, not a dupe.
 *
 * Accepts an optional client so the bot API can pass its service client
 * (same pattern as syncAutoParticipantItems). Returns the match with the
 * nearest relevant date when there are several.
 */
export async function findActiveLeadByPhone(
  phone: string,
  client?: DbClient
): Promise<{ lead: ActiveLeadMatch | null; error?: string }> {
  const normalized = normalizePhone(phone)
  // Only match plausible canonical numbers — garbage/short inputs would
  // otherwise "match" other rows that stored the same garbage.
  if (!normalized || !/^\+\d{9,15}$/.test(normalized)) return { lead: null }

  const supabase = client ?? (await createClient())
  const today = todayIso()

  const { data, error } = await supabase
    .from('participants')
    .select('id, token, full_name, lead_status, preferred_date, preferred_time, confirmed_date, confirmed_time')
    .eq('phone', normalized)
    .in('lead_status', ACTIVE_LEAD_STATUSES)
    .or(
      `confirmed_date.gte.${today},preferred_date.gte.${today},and(confirmed_date.is.null,preferred_date.is.null)`
    )

  if (error) return { lead: null, error: error.message }
  if (!data || data.length === 0) return { lead: null }

  // Nearest upcoming relevant date first; dateless inquiries sort last.
  const relevantDate = (r: (typeof data)[number]) => r.confirmed_date ?? r.preferred_date ?? '9999-12-31'
  const [match] = [...data].sort((a, b) => relevantDate(a).localeCompare(relevantDate(b)))

  return {
    lead: {
      id: match.id,
      token: match.token,
      fullName: match.full_name,
      leadStatus: match.lead_status as LeadStatus,
      preferredDate: match.preferred_date,
      preferredTime: match.preferred_time,
      confirmedDate: match.confirmed_date,
      confirmedTime: match.confirmed_time,
    },
  }
}
