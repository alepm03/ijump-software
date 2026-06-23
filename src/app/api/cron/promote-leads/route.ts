/**
 * Daily cron target: promotes TENTATIVE leads whose preferred month has
 * arrived (see promoteTentativeLeads in src/lib/actions/leads.ts).
 *
 * GET /api/cron/promote-leads
 *
 * Triggered by Vercel Cron (see vercel.json). Vercel automatically attaches
 * `Authorization: Bearer ${CRON_SECRET}` to requests it makes to cron
 * routes when a CRON_SECRET env var is set on the project — we just verify
 * it matches, the same way a webhook signature would be checked.
 *
 * Uses the service client (bypasses RLS): there is no user session/cookies
 * in a cron invocation, so the normal cookie-based client would be running
 * as an unauthenticated anon role and get blocked by RLS.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { promoteTentativeLeads } from '@/lib/actions/leads'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const result = await promoteTentativeLeads(undefined, supabase)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json(result)
}
