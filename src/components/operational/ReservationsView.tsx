'use client'

/**
 * ReservationsView — client island for /reservas.
 *
 * Segmented control (Pendientes / Confirmadas / Canceladas) driven by the
 * `?tab=` search param, same pattern as FinancePeriodSelector. The parent
 * Server Component (page.tsx) re-fetches leads + availability on each
 * navigation and passes the result down as props.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ReservationRow } from '@/components/operational/ReservationRow'
import { AddParticipantDrawer } from '@/components/operational/AddParticipantDrawer'
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

  function handleTabChange(next: LeadFilter) {
    router.push(`/reservas?tab=${next}`)
  }

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
      </div>
    </div>
  )
}
