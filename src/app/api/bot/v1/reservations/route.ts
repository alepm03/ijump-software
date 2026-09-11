/**
 * POST /api/bot/v1/reservations  (scope reservations:write)
 *
 * Creates a booking for the requested date. There is no Stripe/online payment
 * in this module (see docs/reservas/CHECKLIST.md), so unlike the original
 * tech-appendix contract there is no AWAITING_PAYMENT/paymentUrl step.
 *
 * GROUP BOOKINGS (contract v1.2) — a booking is 1..N people. The optional
 * `companions` array carries everyone who is not the organizer. Until now this
 * route accepted exactly one person by design, and the chatbot's own
 * "Tool Crear Reserva" sub-workflow reacted by SKIPPING the call entirely
 * whenever the party was bigger than one (`apiSkipped = 'group'`): couples and
 * groups never reached this system at all, not even the organizer's lead.
 * See docs/reservas/GRUPOS.md.
 *
 * Backwards compatible: with no `companions`, everything behaves exactly as
 * before, so the bot can migrate whenever it is ready — no flag day.
 *
 * Whether the booking is then confirmed in the same call depends on the
 * `bot_autoconfirm_enabled` business setting:
 *
 * - true  → the route confirms it immediately (assigning real seats), so the
 *           bot gets the final outcome (CONFIRMED / TENTATIVE / 409) in one
 *           call, exactly as a staff member clicking "Confirmar" would.
 * - false → (transition phase, 2026-09, the current default) the booking is
 *           left NEW with its preferred_date and shows up in /reservas →
 *           pendientes for a human to confirm. Reason: while reservations
 *           still arrive through the legacy channel, the availability engine
 *           only sees seats booked through THIS system, so auto-assigning one
 *           can double-book a flight the old book already filled. The response
 *           carries requiresStaffConfirmation: true so the bot promises a
 *           callback instead of a confirmed slot.
 *
 * An EVENT (party of `group_event_threshold` or more, 10 by default) is never
 * auto-confirmed regardless of that setting: the team confirms and negotiates
 * it explicitly (Ricardo, 2026-09-11). The bot must say so instead of
 * promising a slot.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateBotRequest, apiErrorResponse } from '@/lib/api/auth'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { findActiveLeadByPhone, getLeadByIdOrToken } from '@/lib/actions/leads'
import { createGroupLead, confirmGroup, cancelGroup, getGroupPartySize } from '@/lib/actions/group'
import { getDayAvailability, listNextAvailableSlots } from '@/lib/actions/availability'
import { classifyDate } from '@/lib/availability/availability-engine'
import { isBotAutoconfirmEnabled, getGroupEventThreshold } from '@/lib/actions/settings'
import { normalizePhone } from '@/lib/phone'
import { todayIso } from '@/lib/utils'
import type { DateClass } from '@/types/domain'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PackageEnum = z.enum(['SOLO', 'HANDYCAM', 'VIDEO_EXTERNO', 'FOTOS', 'HANDYCAM_FOTOS'])

/**
 * A companion gives name, weight and package — no phone, no email: the
 * organizer holds the booking's contact data (Ricardo, 2026-09-11).
 *
 * Weight is optional in the schema but not in practice: it drives the tandem
 * limit, the overweight surcharge and the rig/instructor assignment. A missing
 * weight makes the surcharge a surprise on jump day, so the bot should always
 * ask for it.
 */
const CompanionSchema = z.object({
  fullName: z.string().min(1, 'companions[].fullName is required').max(120).trim(),
  weight: z.number().positive().max(200).optional(),
  packageType: PackageEnum.optional(),
  isMinor: z.boolean().optional(),
})

const ReservationSchema = z.object({
  // H9 (AUDITORIA.md) — bound every free-text field the bot can write: an
  // unbounded string here lands straight in the staff manifest.
  fullName: z.string().min(1, 'fullName is required').max(120).trim(),
  // CRM P0 — normalize at the API boundary so downstream code always sees
  // canonical form. createGroupLead normalizes on write too (single point of
  // truth for internal callers); it is idempotent, so the two never conflict,
  // it just makes the schema's output type reflect what actually gets stored.
  phone: z.string().min(1).max(30).transform(normalizePhone).optional(),
  email: z.string().email().max(254).optional(),
  packageType: PackageEnum.optional(),
  weight: z.number().positive().max(200).optional(),
  isMinor: z.boolean().optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'preferredDate must be YYYY-MM-DD'),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/, 'preferredTime must be HH:MM').optional(),
  source: z.enum(['DIRECT', 'GROUPON', 'BONO', 'PROMO', 'SMARTBOX']).optional(),
  // Abuse guard only (H9 bounds pattern). A party of 30 is not a skydiving
  // booking; anything at or above the event threshold already requires the
  // team to confirm it by hand, so there is no need for a tighter cap here.
  companions: z.array(CompanionSchema).max(29).optional(),
  paymentMode: z.enum(['ORGANIZER', 'INDIVIDUAL', 'UNDECIDED']).optional(),
})

export async function POST(request: Request) {
  const auth = await authenticateBotRequest(request, 'reservations:write')
  if (!auth.ok) return auth.response

  const limited = await enforceRateLimit(auth.context.client, auth.context.apiKeyId, auth.context.rateLimitPerMin)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiErrorResponse(422, 'validation_error', 'Invalid JSON body')
  }

  const parsed = ReservationSchema.safeParse(body)
  if (!parsed.success) {
    return apiErrorResponse(422, 'validation_error', parsed.error.issues.map((i) => i.message).join('; '))
  }
  const input = parsed.data
  const { client } = auth.context

  const companions = input.companions ?? []
  const partySize = companions.length + 1
  const threshold = await getGroupEventThreshold(client)
  const isEvent = partySize >= threshold

  // CRM P0 — idempotency by phone (contract v1.1, CRM_REVIEW §4 guardrail 1):
  // if this phone already has an ACTIVE lead with an upcoming (or no) date,
  // return that booking with duplicate:true instead of creating a second one.
  // The same customer calling Raúl AND messaging the bot must be ONE booking.
  // Best-effort on lookup error: creating a potential duplicate is better
  // than refusing a real reservation.
  if (input.phone) {
    const { lead: existing } = await findActiveLeadByPhone(input.phone, client)
    if (existing) {
      // v1.2 — report how many people that booking already covers, so the bot
      // can say "ya tienes una reserva para 4" instead of a bare duplicate.
      const existingPartySize = existing.reservationGroupId
        ? await getGroupPartySize(existing.reservationGroupId, client)
        : 1
      return NextResponse.json(
        {
          reservationId: existing.id,
          groupId: existing.reservationGroupId,
          token: existing.token,
          status: existing.leadStatus,
          confirmedDate: existing.confirmedDate,
          confirmedTime: existing.confirmedTime,
          partySize: existingPartySize,
          statusUrl: `/reserva/${existing.token}`,
          duplicate: true,
        },
        { status: 200 }
      )
    }
  }

  // Reject a date that cannot take this party BEFORE creating anything: a
  // booking filed against a day where it will never fit is a dead end that
  // the staff has to clean up by hand. Suggestions are filtered by party
  // size too — offering a day with room for 2 to a party of 4 just sends the
  // client back to the start.
  let slots
  try {
    slots = await getDayAvailability(input.preferredDate, client)
  } catch (e) {
    return apiErrorResponse(500, 'internal_error', e instanceof Error ? e.message : 'Availability check failed')
  }
  const classification: DateClass = classifyDate(input.preferredDate, todayIso(), slots)

  const dayIsClosed = classification === 'UNAVAILABLE' || classification === 'NOT_OPERATING'
  // TENTATIVE_ONLY days are far enough out that today's seat count says
  // nothing useful about them — they are parked, not seated.
  const partyDoesNotFit = classification === 'CONFIRMABLE' && slots.totalFreeSeats < partySize

  if (dayIsClosed || partyDoesNotFit) {
    const suggestions = await listNextAvailableSlots(
      { fromDate: input.preferredDate, limit: 3, minSeats: partySize },
      client
    )
    return NextResponse.json(
      {
        error: {
          code: 'unavailable',
          message: partyDoesNotFit
            ? `The requested date cannot take a party of ${partySize}`
            : 'The requested date is not available',
        },
        partySize,
        suggestedDates: suggestions.map((s) => s.date),
      },
      { status: 409 }
    )
  }

  const created = await createGroupLead(
    {
      fullName: input.fullName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      packageType: input.packageType,
      weight: input.weight ?? null,
      isMinor: input.isMinor,
      preferredDate: input.preferredDate,
      preferredTime: input.preferredTime ?? null,
      source: input.source,
      channel: 'WEB_BOT',
      companions,
      paymentMode: input.paymentMode,
    },
    client
  )

  if (created.error || !created.groupId || !created.leadId) {
    return apiErrorResponse(500, 'internal_error', created.error ?? 'Failed to create reservation')
  }

  // An event is never auto-confirmed: the team has to confirm and negotiate
  // it expressly, whatever the transition-phase flag says.
  const autoConfirm = !isEvent && (await isBotAutoconfirmEnabled(client))

  if (autoConfirm) {
    const result = await confirmGroup(created.groupId, input.preferredDate, client)
    if (result.error) {
      return apiErrorResponse(500, 'internal_error', result.error)
    }
    // The day was open a moment ago but the party no longer fits (a
    // concurrent booking took the seats). Drop the dead-end booking so the
    // client's retry can file a clean one — same reasoning as the 2026-07
    // fix: left active, it would trip findActiveLeadByPhone's dedupe guard
    // and come back as duplicate:true with the bad date baked in.
    if (result.classification === 'UNAVAILABLE' || result.classification === 'NOT_OPERATING') {
      await cancelGroup(created.groupId, client)
      const suggestions = await listNextAvailableSlots(
        { fromDate: input.preferredDate, limit: 3, minSeats: partySize },
        client
      )
      return NextResponse.json(
        {
          error: {
            code: 'unavailable',
            message: result.groupDoesNotFit
              ? `The requested date cannot take a party of ${partySize}`
              : 'The requested date is not available',
          },
          partySize,
          suggestedDates: suggestions.map((s) => s.date),
        },
        { status: 409 }
      )
    }
  }

  const { lead } = await getLeadByIdOrToken(created.leadId, client)

  return NextResponse.json(
    {
      reservationId: created.leadId,
      groupId: created.groupId,
      token: created.token,
      status: lead?.status ?? null,
      dateClassification: classification,
      confirmedDate: lead?.confirmedDate ?? null,
      confirmedTime: lead?.confirmedTime ?? null,
      partySize,
      // A party this size is an EVENT: accepted, but the team confirms and
      // negotiates it expressly. The bot must say so, not promise a slot.
      isEvent,
      // The bot must NOT promise a slot while this is true: the booking is
      // only queued in /reservas, no seat is held for it yet.
      requiresStaffConfirmation: !autoConfirm,
      participants: (created.members ?? []).map((m) => ({
        id: m.id,
        fullName: m.fullName,
        isOrganizer: m.isOrganizer,
        statusUrl: `/reserva/${m.token}`,
      })),
      statusUrl: `/reserva/${created.token}`,
    },
    { status: 201 }
  )
}
