/**
 * /reservas — Lead/reservation review list (Server Component).
 *
 * URL params:
 *   tab = 'pending' | 'reschedule' | 'confirmed' | 'cancelled'  (default: 'pending')
 *
 * Downloads only the active tab's rows; the other two badges come from
 * head-only count queries. The pending/reschedule tabs additionally attach a
 * live availability classification PER LEAD (keyed by lead id): the day-level
 * class from classifyDate, then a time-slot overlay (classifyLeadSlot) so a
 * lead who asked for an exact hour that is already full surfaces as a
 * Conflicto instead of a false "Libre". Day availability + occupancy are
 * fetched once per distinct date and reused across the leads sharing it.
 */

import { countLeadAttention, countLeads, listLeads, type LeadFilter } from '@/lib/actions/leads'
import { getDayAvailability, getDayOccupancy, getPolicy } from '@/lib/actions/availability'
import { classifyDate, classifyLeadSlot } from '@/lib/availability/availability-engine'
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

  // Pending/reschedule tabs need live availability. Fetch the day slots +
  // per-hour occupancy once per distinct date, then classify EACH lead with
  // its own preferred_time overlay. Keyed by lead id (the pending set is small
  // — see listLeads). Reuses the already-fetched policy.
  const classifications: Record<string, DateClass> = {}
  if (needsAvailability && policy) {
    const today = todayIso()
    const distinctDates = [...new Set(activeLeads.map((l) => l.preferredDate).filter((d): d is string => !!d))]
    const byDate = new Map<string, { base: DateClass; occupancy: Awaited<ReturnType<typeof getDayOccupancy>> }>()
    await Promise.all(
      distinctDates.map(async (date) => {
        const [slots, occupancy] = await Promise.all([
          getDayAvailability(date, undefined, policy),
          getDayOccupancy(date),
        ])
        byDate.set(date, { base: classifyDate(date, today, slots), occupancy })
      })
    )
    for (const lead of activeLeads) {
      if (!lead.preferredDate) continue
      const entry = byDate.get(lead.preferredDate)
      if (!entry) continue
      classifications[lead.id] = classifyLeadSlot(entry.base, lead.preferredTime, entry.occupancy)
    }
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
