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
 *
 * Fails closed: if CRON_SECRET is not configured on the project, every
 * request is rejected with 401 rather than matching against the literal
 * string "Bearer undefined". A daily 401 in the Vercel logs for this route
 * means CRON_SECRET is missing, not that the cron is broken.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { promoteTentativeLeads, sweepOverdueNoShows } from '@/lib/actions/leads'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const result = await promoteTentativeLeads(undefined, supabase)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // CRM no-show circuit — sweep runs after promotion so a lead promoted
  // today is never immediately swept (promotion only confirms future
  // dates; the sweep only looks at past ones). A sweep error is reported
  // in the payload but does not fail the whole cron: the promotion above
  // already succeeded and must not be retried blindly.
  const sweep = await sweepOverdueNoShows(supabase)

  return NextResponse.json({ ...result, noShowsMarked: sweep.marked, noShowSweepError: sweep.error })
}
