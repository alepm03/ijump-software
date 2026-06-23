'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createParticipant, freeSeat } from '@/lib/actions/participant'
import { getDayAvailability, type DbClient } from '@/lib/actions/availability'
import { classifyDate } from '@/lib/availability/availability-engine'
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
  input: CreateLeadInput
): Promise<{ error?: string; leadId?: string }> {
  const result = await createParticipant(null, {
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
  })
  if (result.error) return { error: result.error }
  return { leadId: result.id }
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
    .update({ preferred_date: date, preferred_time: time ?? null })
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
      .update({ lead_status: 'TENTATIVE', preferred_date: date })
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

  revalidatePath('/', 'layout')
  return { classification: 'CONFIRMABLE', flightId: data.flight_id }
}

/** Releases the lead's current slot (if any) and re-confirms it for a new date. */
export async function rescheduleLead(leadId: string, newDate: string): Promise<ConfirmLeadResult> {
  await freeSeat(leadId)
  const supabase = await createClient()
  await supabase.from('participants').update({ lead_status: 'NEW' }).eq('id', leadId)
  return confirmLead(leadId, newDate)
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

export async function cancelLead(leadId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('participants')
    .update({ flight_id: null, lead_status: 'CANCELLED' })
    .eq('id', leadId)
  if (error) return { error: error.message }
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
