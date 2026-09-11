/**
 * GET /api/bot/v1/availability/day?date=YYYY-MM-DD  (scope availability:read)
 *
 * Returns the full DaySlots breakdown for a single date.
 */

import { NextResponse } from 'next/server'
import { authenticateBotRequest, apiErrorResponse } from '@/lib/api/auth'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { getDayAvailability } from '@/lib/actions/availability'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await authenticateBotRequest(request, 'availability:read')
  if (!auth.ok) return auth.response

  const limited = await enforceRateLimit(auth.context.client, auth.context.apiKeyId, auth.context.rateLimitPerMin)
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return apiErrorResponse(422, 'validation_error', '`date` is required and must be YYYY-MM-DD')
  }

  const slots = await getDayAvailability(date, auth.context.client)
  return NextResponse.json(slots)
}
