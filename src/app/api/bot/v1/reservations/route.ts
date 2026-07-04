/**
 * POST /api/bot/v1/reservations  (scope reservations:write)
 *
 * Creates a lead and immediately attempts to confirm it for the
 * requested date — there is no Stripe/online payment in this module
 * (see docs/reservas/CHECKLIST.md), so unlike the original tech-appendix
 * contract there is no AWAITING_PAYMENT/paymentUrl step: the bot gets the
 * final outcome (CONFIRMED / TENTATIVE / 409 unavailable) in one call,
 * the same as a staff member clicking "Confirmar" in /reservas would.
 *
 * Batch/companion participants (the `participants?` array in the
 * original contract) are deferred — out of scope for this pass, the bot
 * creates one lead per request.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateBotRequest, apiErrorResponse } from '@/lib/api/auth'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { createLead, confirmLead, getLeadByIdOrToken } from '@/lib/actions/leads'
import { listNextAvailableSlots } from '@/lib/actions/availability'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ReservationSchema = z.object({
  fullName: z.string().min(1, 'fullName is required'),
  // CRM P0 — normalize at the API boundary so downstream code (createLead ->
  // createParticipant) always sees canonical form. createParticipant also
  // normalizes on write (single point of truth for internal callers); this
  // is idempotent so the two never conflict, it just makes the schema's
  // output type reflect what actually gets stored.
  phone: z.string().min(1).transform(normalizePhone).optional(),
  email: z.string().email().optional(),
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

  const result = await confirmLead(created.leadId, input.preferredDate, client)
  if (result.error) {
    return apiErrorResponse(500, 'internal_error', result.error)
  }

  if (result.classification === 'UNAVAILABLE' || result.classification === 'NOT_OPERATING') {
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
      dateClassification: result.classification,
      confirmedDate: lead?.confirmedDate ?? null,
      confirmedTime: lead?.confirmedTime ?? null,
      statusUrl: `/reserva/${created.token}`,
    },
    { status: 201 }
  )
}
