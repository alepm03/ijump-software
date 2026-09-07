/**
 * POST /api/bot/v1/reservations  (scope reservations:write)
 *
 * Creates a lead for the requested date. There is no Stripe/online payment
 * in this module (see docs/reservas/CHECKLIST.md), so unlike the original
 * tech-appendix contract there is no AWAITING_PAYMENT/paymentUrl step.
 *
 * Whether the lead is then confirmed in the same call depends on the
 * `bot_autoconfirm_enabled` business setting:
 *
 * - true  → the route confirms it immediately (assigning a real seat), so the
 *           bot gets the final outcome (CONFIRMED / TENTATIVE / 409) in one
 *           call, exactly as a staff member clicking "Confirmar" would.
 * - false → (transition phase, 2026-09, the current default) the lead is left
 *           NEW with its preferred_date and shows up in /reservas → pendientes
 *           for a human to confirm. Reason: while reservations still arrive
 *           through the legacy channel, the availability engine only sees
 *           seats booked through THIS system, so auto-assigning one can
 *           double-book a flight the old book already filled. The response
 *           carries requiresStaffConfirmation: true so the bot promises a
 *           callback instead of a confirmed slot.
 *
 * Batch/companion participants (the `participants?` array in the
 * original contract) are deferred — out of scope for this pass, the bot
 * creates one lead per request.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateBotRequest, apiErrorResponse } from '@/lib/api/auth'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { createLead, confirmLead, cancelLead, findActiveLeadByPhone, getLeadByIdOrToken } from '@/lib/actions/leads'
import { classifyDateLive, listNextAvailableSlots } from '@/lib/actions/availability'
import { isBotAutoconfirmEnabled } from '@/lib/actions/settings'
import { normalizePhone } from '@/lib/phone'
import type { DateClass } from '@/types/domain'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ReservationSchema = z.object({
  // H9 (AUDITORIA.md) — bound every free-text field the bot can write: an
  // unbounded string here lands straight in the staff manifest.
  fullName: z.string().min(1, 'fullName is required').max(120).trim(),
  // CRM P0 — normalize at the API boundary so downstream code (createLead ->
  // createParticipant) always sees canonical form. createParticipant also
  // normalizes on write (single point of truth for internal callers); this
  // is idempotent so the two never conflict, it just makes the schema's
  // output type reflect what actually gets stored.
  phone: z.string().min(1).max(30).transform(normalizePhone).optional(),
  email: z.string().email().max(254).optional(),
  packageType: z.enum(['SOLO', 'HANDYCAM', 'VIDEO_EXTERNO', 'FOTOS', 'HANDYCAM_FOTOS']).optional(),
  weight: z.number().positive().max(200).optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'preferredDate must be YYYY-MM-DD'),
  source: z.enum(['DIRECT', 'GROUPON', 'BONO', 'PROMO', 'SMARTBOX']).optional(),
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

  // CRM P0 — idempotency by phone (contract v1.1, CRM_REVIEW §4 guardrail 1):
  // if this phone already has an ACTIVE lead with an upcoming (or no) date,
  // return that lead with duplicate:true instead of creating a second one.
  // The same customer calling Raúl AND messaging the bot must be ONE lead.
  // Best-effort on lookup error: creating a potential duplicate is better
  // than refusing a real reservation.
  if (input.phone) {
    const { lead: existing } = await findActiveLeadByPhone(input.phone, client)
    if (existing) {
      return NextResponse.json(
        {
          reservationId: existing.id,
          token: existing.token,
          status: existing.leadStatus,
          confirmedDate: existing.confirmedDate,
          confirmedTime: existing.confirmedTime,
          statusUrl: `/reserva/${existing.token}`,
          duplicate: true,
        },
        { status: 200 }
      )
    }
  }

  // Transition-phase gate (see the file header): off means the bot only files
  // the lead, staff confirm it from /reservas.
  const autoConfirm = await isBotAutoconfirmEnabled(client)

  const created = await createLead(
    {
      fullName: input.fullName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      packageType: input.packageType,
      weight: input.weight ?? null,
      source: input.source,
      preferredDate: input.preferredDate,
      channel: 'WEB_BOT',
    },
    client
  )

  if (created.error || !created.leadId) {
    return apiErrorResponse(500, 'internal_error', created.error ?? 'Failed to create reservation')
  }

  // Both branches below classify the requested date; only the autoconfirm one
  // acts on it. An unbookable date is rejected either way — accepting a lead
  // for a closed or full day just moves the dead end to the staff queue.
  let classification: DateClass | undefined
  if (autoConfirm) {
    const result = await confirmLead(created.leadId, input.preferredDate, client)
    if (result.error) {
      return apiErrorResponse(500, 'internal_error', result.error)
    }
    classification = result.classification
  } else {
    try {
      classification = await classifyDateLive(input.preferredDate, client)
    } catch (e) {
      return apiErrorResponse(500, 'internal_error', e instanceof Error ? e.message : 'Availability check failed')
    }
  }

  if (classification === 'UNAVAILABLE' || classification === 'NOT_OPERATING') {
    // Bug fix (2026-07): the requested date can't take this lead, so the lead
    // created above is a dead end with a NEW status and the unavailable date
    // baked in. Left as-is, it stays ACTIVE_LEAD_STATUSES-active and the
    // client's inevitable retry (accepting one of the suggestedDates below)
    // trips findActiveLeadByPhone's dedupe guard, coming back as
    // duplicate:true with THIS lead's bad date instead of creating a fresh
    // one with the date the customer actually wants. Cancel it so it drops
    // out of the active set and the retry can create a clean lead.
    await cancelLead(created.leadId, client)
    const suggestions = await listNextAvailableSlots({ fromDate: input.preferredDate, limit: 3 }, client)
    return NextResponse.json(
      {
        error: { code: 'unavailable', message: 'The requested date is not available' },
        suggestedDates: suggestions.map((s) => s.date),
      },
      { status: 409 }
    )
  }

  const { lead } = await getLeadByIdOrToken(created.leadId, client)

  return NextResponse.json(
    {
      reservationId: created.leadId,
      token: created.token,
      status: lead?.status ?? null,
      dateClassification: classification,
      confirmedDate: lead?.confirmedDate ?? null,
      confirmedTime: lead?.confirmedTime ?? null,
      // The bot must NOT promise a slot while this is true: the lead is only
      // queued in /reservas, no seat is held for it yet.
      requiresStaffConfirmation: !autoConfirm,
      statusUrl: `/reserva/${created.token}`,
    },
    { status: 201 }
  )
}
