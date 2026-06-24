/**
 * Bot API authentication — validates `X-API-Key` against `api_keys`.
 *
 * Keys are never stored in plaintext: the client sends `ijk_live_<rnd>`,
 * we hash it with sha256 and compare against `key_hash`. There is no user
 * session in a bot request, so this always uses the service client
 * (bypasses RLS) — the same pattern as the cron endpoint.
 */

import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { DbClient } from '@/lib/actions/availability'

export type ApiAuthContext = {
  apiKeyId: string
  scopes: string[]
  rateLimitPerMin: number
  client: DbClient
}

export type ApiAuthResult =
  | { ok: true; context: ApiAuthContext }
  | { ok: false; response: NextResponse }

export function apiErrorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: { code, message }, ...extra }, { status })
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

/** Validates the API key and required scope. Bumps last_used_at on success. */
export async function authenticateBotRequest(
  request: Request,
  requiredScope: string
): Promise<ApiAuthResult> {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) {
    return { ok: false, response: apiErrorResponse(401, 'unauthorized', 'Missing X-API-Key header') }
  }

  const client = createServiceClient()
  const keyHash = hashApiKey(apiKey)

  const { data, error } = await client
    .from('api_keys')
    .select('id, scopes, rate_limit_per_min, active')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (error || !data || !data.active) {
    return { ok: false, response: apiErrorResponse(401, 'unauthorized', 'Invalid API key') }
  }

  if (!data.scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: apiErrorResponse(403, 'forbidden', `API key is missing required scope: ${requiredScope}`),
    }
  }

  await client.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)

  return {
    ok: true,
    context: {
      apiKeyId: data.id,
      scopes: data.scopes,
      rateLimitPerMin: data.rate_limit_per_min,
      client,
    },
  }
}
