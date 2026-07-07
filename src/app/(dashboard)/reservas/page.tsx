/**
 * /reservas — Lead/reservation review list (Server Component).
 *
 * URL params:
 *   tab = 'pending' | 'confirmed' | 'cancelled'  (default: 'pending')
 *
 * Fetches all three tab counts in parallel (for the segmented control badges),
 * and for the active tab's leads attaches a live availability classification
 * per distinct preferred_date (deduped — several leads often share a date).
 */

import { listLeads, type LeadFilter } from '@/lib/actions/leads'
import { getDayAvailability } from '@/lib/actions/availability'
import { classifyDate } from '@/lib/availability/availability-engine'
import { ReservationsView } from '@/components/operational/ReservationsView'
import { isLeadCold } from '@/lib/utils'
import type { DateClass } from '@/types/domain'

const VALID_TABS: LeadFilter[] = ['pending', 'confirmed', 'cancelled']

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

export default async function ReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const tab: LeadFilter =
    sp.tab && VALID_TABS.includes(sp.tab as LeadFilter) ? (sp.tab as LeadFilter) : 'pending'

  const [pendingResult, confirmedResult, cancelledResult] = await Promise.all([
    listLeads('pending'),
    listLeads('confirmed'),
    listLeads('cancelled'),
  ])

  const resultByTab = {
    pending: pendingResult,
    confirmed: confirmedResult,
    cancelled: cancelledResult,
  }

  const counts: Record<LeadFilter, number> = {
    pending: pendingResult.leads.length,
    confirmed: confirmedResult.leads.length,
    cancelled: cancelledResult.leads.length,
  }

  const activeLeads = resultByTab[tab].leads

  // Cold-leads alert (CRM P0): always computed over the pending set so it
  // stays visible from any tab. Same rule as countLeadAttention (sidebar).
  const coldCount = pendingResult.leads.filter(
    (l) =>
      (l.leadStatus === 'NEW' || l.leadStatus === 'RESCHEDULE_NEEDED') && isLeadCold(l.lastContactAt)
  ).length

  // Only the "pending" tab needs live availability — dedupe by date to avoid N queries.
  const classifications: Record<string, DateClass> = {}
  if (tab === 'pending') {
    const today = todayIso()
    const distinctDates = [...new Set(activeLeads.map((l) => l.preferredDate).filter((d): d is string => !!d))]
    await Promise.all(
      distinctDates.map(async (date) => {
        const slots = await getDayAvailability(date)
        classifications[date] = classifyDate(date, today, slots)
      })
    )
  }

  return (
    <ReservationsView
      tab={tab}
      leads={activeLeads}
      counts={counts}
      classifications={classifications}
      coldCount={coldCount}
    />
  )
}
