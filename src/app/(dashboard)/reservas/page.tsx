/**
 * /reservas — Lead/reservation review list (Server Component).
 *
 * URL params:
 *   tab = 'pending' | 'reschedule' | 'confirmed' | 'cancelled'  (default: 'pending')
 *
 * Downloads only the active tab's rows; the other two badges come from
 * head-only count queries. The pending tab additionally attaches a live
 * availability classification per distinct preferred_date (deduped — several
 * leads often share a date), reusing a single policy fetch.
 */

import { countLeadAttention, countLeads, listLeads, type LeadFilter } from '@/lib/actions/leads'
import { getDayAvailability, getPolicy } from '@/lib/actions/availability'
import { classifyDate } from '@/lib/availability/availability-engine'
import { ReservationsView } from '@/components/operational/ReservationsView'
import type { DateClass } from '@/types/domain'

const VALID_TABS: LeadFilter[] = ['pending', 'reschedule', 'confirmed', 'cancelled']

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

  // Only the active tab downloads rows; the other badges are head-only counts.
  const inactiveTabs = VALID_TABS.filter((t) => t !== tab)
  const needsAvailability = tab === 'pending' || tab === 'reschedule'
  const [activeResult, inactiveCounts, policy, attention] = await Promise.all([
    listLeads(tab),
    Promise.all(inactiveTabs.map((t) => countLeads(t))),
    needsAvailability ? getPolicy() : Promise.resolve(null),
    countLeadAttention(),
  ])

  const activeLeads = activeResult.leads
  const counts: Record<LeadFilter, number> = {
    pending: 0,
    reschedule: 0,
    confirmed: 0,
    cancelled: 0,
    [tab]: activeLeads.length,
  }
  inactiveTabs.forEach((t, i) => {
    counts[t] = inactiveCounts[i]
  })

  // Cold-leads alert (CRM P0): always computed over the pending set so it
  // stays visible from any tab. Same rule as the sidebar badge.
  const coldCount = attention.cold

  // Pending/reschedule tabs need live availability — dedupe by date to avoid N
  // queries, and reuse the already-fetched policy instead of one fetch per date.
  const classifications: Record<string, DateClass> = {}
  if (needsAvailability && policy) {
    const today = todayIso()
    const distinctDates = [...new Set(activeLeads.map((l) => l.preferredDate).filter((d): d is string => !!d))]
    await Promise.all(
      distinctDates.map(async (date) => {
        const slots = await getDayAvailability(date, undefined, policy)
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
