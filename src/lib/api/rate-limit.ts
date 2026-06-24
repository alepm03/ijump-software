/**
 * Bot API rate limiting — fixed 60s window, atomic via the
 * bump_rate_limit Postgres function (no Redis dependency, see
 * supabase/migrations/20260628000000_bump_rate_limit.sql).
 */

import { NextResponse } from 'next/server'
import type { DbClient } from '@/lib/actions/availability'
import { apiErrorResponse } from '@/lib/api/auth'

/** Returns a 429 response if the key is over its limit, otherwise null. */
export async function enforceRateLimit(
  client: DbClient,
  apiKeyId: string,
  limitPerMin: number
): Promise<NextResponse | null> {
  const { data, error } = await client
    .rpc('bump_rate_limit', { p_api_key_id: apiKeyId, p_limit_per_min: limitPerMin })
    .single()

  if (error) {
    return apiErrorResponse(500, 'internal_error', error.message)
  }

  if (!data.allowed) {
    const response = apiErrorResponse(429, 'rate_limited', 'Too many requests')
    response.headers.set('Retry-After', String(data.retry_after_seconds))
    return response
  }

  return null
}
