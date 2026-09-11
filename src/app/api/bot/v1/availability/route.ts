/**
 * GET /api/bot/v1/availability?from=YYYY-MM-DD&limit=6&partySize=4  (scope availability:read)
 *
 * Returns the next `limit` bookable operating days from `from` (default
 * today), each classified CONFIRMABLE or TENTATIVE_ONLY — what the bot
 * uses to suggest dates to a customer.
 *
 * `partySize` (contract v1.2) filters out days that cannot take a group that
 * size. A booking is seated whole or not at all, so offering a day with room
 * for 2 to a party of 4 just sends the client back to the start. Omitted or 1
 * means the same behaviour as before.
 */

import { NextResponse } from 'next/server'
import { authenticateBotRequest, apiErrorResponse } from '@/lib/api/auth'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { listNextAvailableSlots } from '@/lib/actions/availability'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await authenticateBotRequest(request, 'availability:read')
  if (!auth.ok) return auth.response

  const limited = await enforceRateLimit(auth.context.client, auth.context.apiKeyId, auth.context.rateLimitPerMin)
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? undefined
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : 6
  const partySizeParam = searchParams.get('partySize')
  const partySize = partySizeParam ? Number(partySizeParam) : 1

  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return apiErrorResponse(422, 'validation_error', '`from` must be YYYY-MM-DD')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    return apiErrorResponse(422, 'validation_error', '`limit` must be an integer between 1 and 30')
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30) {
    return apiErrorResponse(422, 'validation_error', '`partySize` must be an integer between 1 and 30')
  }

  const slots = await listNextAvailableSlots(
    { fromDate: from, limit, minSeats: partySize },
    auth.context.client
  )

  return NextResponse.json({
    slots: slots.map((s) => ({
      date: s.date,
      freeSeats: s.slots.totalFreeSeats,
      classification: s.classification,
    })),
  })
}
