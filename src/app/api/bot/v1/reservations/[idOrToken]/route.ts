/**
 * GET /api/bot/v1/reservations/{idOrToken}  (scope status:read)
 *
 * Looks up a lead by its internal id or its public token.
 */

import { NextResponse } from 'next/server'
import { authenticateBotRequest, apiErrorResponse } from '@/lib/api/auth'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { getLeadByIdOrToken } from '@/lib/actions/leads'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ idOrToken: string }> }) {
  const auth = await authenticateBotRequest(request, 'status:read')
  if (!auth.ok) return auth.response

  const limited = await enforceRateLimit(auth.context.client, auth.context.apiKeyId, auth.context.rateLimitPerMin)
  if (limited) return limited

  const { idOrToken } = await params
  const result = await getLeadByIdOrToken(idOrToken, auth.context.client)

  if (result.error || !result.lead) {
    return apiErrorResponse(404, 'not_found', 'Reservation not found')
  }

  return NextResponse.json(result.lead)
}
