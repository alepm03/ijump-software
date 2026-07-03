'use client'

/**
 * ReservationsView — client island for /reservas.
 *
 * Segmented control (Pendientes / Confirmadas / Canceladas) driven by the
 * `?tab=` search param, same pattern as FinancePeriodSelector. The parent
 * Server Component (page.tsx) re-fetches leads + availability on each
 * navigation and passes the result down as props.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { ReservationRow } from '@/components/operational/ReservationRow'
import { AddParticipantDrawer } from '@/components/operational/AddParticipantDrawer'
import { GroupRescheduleModal } from '@/components/operational/GroupRescheduleModal'
import type { LeadFilter } from '@/lib/actions/leads'
import type { DateClass, LeadWithDetails } from '@/types/domain'

const TABS: { id: LeadFilter; label: string }[] = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'confirmed', label: 'Confirmadas' },
  { id: 'cancelled', label: 'Canceladas' },
]

interface ReservationsViewProps {
  tab: LeadFilter
  leads: LeadWithDetails[]
  counts: Record<LeadFilter, number>
  classifications: Record<string, DateClass>
}

export function ReservationsView({ tab, leads, counts, classifications }: ReservationsViewProps) {
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [groupDate, setGroupDate] = useState<string | null>(null)

  function handleTabChange(next: LeadFilter) {
    router.push(`/reservas?tab=${next}`)
  }

  // Sprint 3 E3 — group RESCHEDULE_NEEDED leads by preferredDate so the staff
  // can reassign an entire weather-cancelled day in one pass instead of
  // rebooking each lead individually. Only surfaced on the 'pending' tab.
  const rescheduleGroups = useMemo(() => {
    if (tab !== 'pending') return []
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
      <div className="flex flex-col gap-4 max-w-4xl mx-auto p-6 w-full">
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
                'border-none cursor-pointer font-medium text-[12.5px] px-[14px] py-[5px] rounded-md transition-all',
                tab === t.id
                  ? 'bg-card text-foreground font-semibold shadow-sm'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label} <span className="text-muted-foreground">{counts[t.id]}</span>
            </button>
          ))}
        </div>

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
          {leads.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
              No hay reservas en esta categoría.
            </div>
          ) : (
            leads.map((lead) => (
              <ReservationRow
                key={lead.id}
                lead={lead}
                tab={tab}
                classification={lead.preferredDate ? classifications[lead.preferredDate] ?? null : null}
              />
            ))
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
      </div>
    </div>
  )
}
