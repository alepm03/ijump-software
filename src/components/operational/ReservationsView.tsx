'use client'

/**
 * ReservationsView — client island for /reservas.
 *
 * Segmented control (Pendientes / Confirmadas / Canceladas) driven by the
 * `?tab=` search param, same pattern as FinancePeriodSelector. The parent
 * Server Component (page.tsx) re-fetches leads + availability on each
 * navigation and passes the result down as props.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { ReservationRow, ReservationListHeader } from '@/components/operational/ReservationRow'
import { LeadSheet } from '@/components/operational/LeadSheet'
import { AddParticipantDrawer } from '@/components/operational/AddParticipantDrawer'
import { GroupRescheduleModal } from '@/components/operational/GroupRescheduleModal'
import type { LeadFilter } from '@/lib/actions/leads'
import type { DateClass, LeadWithDetails } from '@/types/domain'

const TABS: { id: LeadFilter; label: string }[] = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'reschedule', label: 'Reagendar' },
  { id: 'confirmed', label: 'Confirmadas' },
  { id: 'cancelled', label: 'Canceladas' },
]

interface ReservationsViewProps {
  tab: LeadFilter
  leads: LeadWithDetails[]
  counts: Record<LeadFilter, number>
  classifications: Record<string, DateClass>
  /**
   * CRM P0 — lead-aging queue, computed server-side over the PENDING set so
   * the alert is visible from any tab (leads awaiting staff action — NEW /
   * RESCHEDULE_NEEDED — without contact for >48h). TENTATIVE excluded on
   * purpose: those wait for their month, not for a human.
   */
  coldCount: number
}

export function ReservationsView({ tab, leads, counts, classifications, coldCount }: ReservationsViewProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [groupDate, setGroupDate] = useState<string | null>(null)
  const [sortByAging, setSortByAging] = useState(false)
  // Lead detail sheet — track the id (not the object) so router.refresh()
  // always re-renders the sheet with the fresh server-fetched lead.
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null)
  const detailLead = detailLeadId ? leads.find((l) => l.id === detailLeadId) ?? null : null

  // Roadmap item 4 — recoverable no-shows: a NO_SHOW lead whose confirmed
  // jump was this month still has its platform bono/payment collected;
  // reactivating them is pure margin. Disappears from this count once
  // reactivated (lead_status leaves NO_SHOW, so it drops out of the
  // 'cancelled' tab filter — see STATUSES_BY_FILTER in leads.ts).
  const recoverableNoShowCount = useMemo(() => {
    if (tab !== 'reschedule') return 0
    const currentYearMonth = format(new Date(), 'yyyy-MM')
    return leads.filter(
      (l) => l.leadStatus === 'NO_SHOW' && l.confirmedDate?.startsWith(currentYearMonth)
    ).length
  }, [tab, leads])

  // Default order (jump date, from the server) vs. contact-age order
  // (coldest first). In-memory sort: the pending list is small.
  const displayLeads = useMemo(() => {
    if (tab !== 'pending' || !sortByAging) return leads
    return [...leads].sort((a, b) => {
      const ta = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0
      const tb = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0
      return ta - tb
    })
  }, [tab, leads, sortByAging])

  function handleTabChange(next: LeadFilter) {
    // Transition so the current list stays visible (dimmed) while the server
    // re-renders — same-segment searchParams changes never trigger loading.tsx.
    startTransition(() => router.push(`/reservas?tab=${next}`))
  }

  // Sprint 3 E3 — group RESCHEDULE_NEEDED leads by preferredDate so the staff
  // can reassign an entire weather-cancelled day in one pass instead of
  // rebooking each lead individually. Surfaced on the 'reschedule' tab.
  const rescheduleGroups = useMemo(() => {
    if (tab !== 'reschedule') return []
    const byDate = new Map<string, LeadWithDetails[]>()
    for (const lead of leads) {
      if (lead.leadStatus !== 'RESCHEDULE_NEEDED' || !lead.preferredDate) continue
      const group = byDate.get(lead.preferredDate) ?? []
      group.push(lead)
      byDate.set(lead.preferredDate, group)
    }
    return Array.from(byDate.entries())
      .filter(([, group]) => group.length >= 2)
      .sort(([a], [b]) => a.localeCompare(b))
  }, [tab, leads])

  const activeGroupLeads = groupDate
    ? rescheduleGroups.find(([date]) => date === groupDate)?.[1] ?? []
    : []

  return (
    <div className="flex-1 overflow-y-auto">
      <div
        className={cn(
          'flex flex-col gap-4 max-w-4xl mx-auto p-6 w-full transition-opacity',
          isPending && 'opacity-50 pointer-events-none'
        )}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-title font-bold text-foreground">Reservas</h1>
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-sm font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + Nueva Reserva
          </button>
        </div>

        <div
          className="inline-flex bg-secondary border border-border rounded-lg p-[3px] w-fit"
          role="tablist"
          aria-label="Estado de la reserva"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => handleTabChange(t.id)}
              className={cn(
                'border-none cursor-pointer font-medium text-[0.78125rem] px-[14px] py-[5px] rounded-md transition-all',
                tab === t.id
                  ? 'bg-card text-foreground font-semibold shadow-sm'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label} <span className="text-muted-foreground">{counts[t.id]}</span>
            </button>
          ))}
        </div>

        {coldCount > 0 && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-700">
              <span className="font-semibold">{coldCount}</span>{' '}
              {coldCount === 1 ? 'lead sin contacto' : 'leads sin contacto'} hace más de 48h
            </p>
            {tab === 'pending' ? (
              <button
                onClick={() => setSortByAging((v) => !v)}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-md transition-colors shrink-0',
                  sortByAging
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-amber-700 hover:bg-amber-100'
                )}
              >
                {sortByAging ? 'Ordenar por fecha de salto' : 'Ordenar por antigüedad'}
              </button>
            ) : (
              <button
                onClick={() => router.push('/reservas?tab=pending')}
                className="text-xs font-semibold px-3 py-1.5 rounded-md text-amber-700 hover:bg-amber-100 transition-colors shrink-0"
              >
                Ver pendientes
              </button>
            )}
          </div>
        )}

        {tab === 'reschedule' && recoverableNoShowCount > 0 && (
          <div className="flex items-center gap-3 bg-secondary border border-border rounded-lg px-4 py-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{recoverableNoShowCount}</span>{' '}
              {recoverableNoShowCount === 1 ? 'no-show recuperable' : 'no-shows recuperables'} este mes
            </p>
          </div>
        )}

        {rescheduleGroups.map(([date, group]) => (
          <div
            key={date}
            className="flex items-center justify-between gap-3 bg-secondary border border-border rounded-lg px-4 py-3"
          >
            <p className="text-sm text-foreground">
              <span className="font-semibold">{group.length}</span> reservas del{' '}
              <span className="font-semibold">
                {format(parseISO(date), "EEEE d 'de' MMMM", { locale: es })}
              </span>{' '}
              por reagendar
            </p>
            <button
              onClick={() => setGroupDate(date)}
              className="text-sm font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
            >
              Reubicar grupo
            </button>
          </div>
        ))}

        <div className="flex flex-col gap-2">
          {displayLeads.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
              No hay reservas en esta categoría.
            </div>
          ) : (
            <>
              <ReservationListHeader tab={tab} />
              {displayLeads.map((lead) => (
                <ReservationRow
                  key={lead.id}
                  lead={lead}
                  tab={tab}
                  classification={lead.preferredDate ? classifications[lead.preferredDate] ?? null : null}
                  onOpenDetail={() => setDetailLeadId(lead.id)}
                />
              ))}
            </>
          )}
        </div>

        <AddParticipantDrawer
          mode="lead"
          open={drawerOpen}
          flightId={null}
          instructors={[]}
          onClose={() => setDrawerOpen(false)}
          onSuccess={() => {
            setDrawerOpen(false)
            router.refresh()
          }}
        />

        <GroupRescheduleModal
          leads={activeGroupLeads}
          open={groupDate !== null}
          onOpenChange={(open) => {
            if (!open) setGroupDate(null)
          }}
        />

        <LeadSheet
          lead={detailLead}
          onOpenChange={(open) => {
            if (!open) setDetailLeadId(null)
          }}
        />
      </div>
    </div>
  )
}
