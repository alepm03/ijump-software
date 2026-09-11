'use client'

/**
 * GroupRescheduleModal — Sprint 3 E3.
 *
 * Bulk reschedule flow for the group of leads that share a weather-cancelled
 * preferredDate (see ReservationsView's rescheduleGroups + leads.ts'
 * rescheduleLeadsBatch). Two phases:
 *
 *   1. ASSIGNMENT — one shared WeekendAvailabilityCalendar; staff clicks a
 *      lead to make it "active", picks a date for it, and the flow
 *      auto-advances to the next unassigned lead for speed. Leads left
 *      unassigned are simply skipped — they stay RESCHEDULE_NEEDED.
 *   2. SUMMARY — result of rescheduleLeadsBatch per lead.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { rescheduleLeadsBatch, type LeadRescheduleOutcome } from '@/lib/actions/leads'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { WeekendAvailabilityCalendar } from '@/components/operational/WeekendAvailabilityCalendar'
import { cn } from '@/lib/utils'
import type { DateClass, LeadWithDetails } from '@/types/domain'

interface GroupRescheduleModalProps {
  leads: LeadWithDetails[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Assignment = { date: string; classification: DateClass }

export function GroupRescheduleModal({ leads, open, onOpenChange }: GroupRescheduleModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeLeadId, setActiveLeadId] = useState<string | null>(leads[0]?.id ?? null)
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({})
  const [results, setResults] = useState<LeadRescheduleOutcome[] | null>(null)

  const activeLead = leads.find((l) => l.id === activeLeadId) ?? leads[0] ?? null
  const assignedCount = Object.keys(assignments).length

  const initialMonth = useMemo(() => leads[0]?.preferredDate?.slice(0, 7), [leads])

  function reset() {
    setActiveLeadId(leads[0]?.id ?? null)
    setAssignments({})
    setResults(null)
  }

  function handleSelectDate(date: string, classification: DateClass) {
    if (!activeLead) return
    setAssignments((prev) => ({ ...prev, [activeLead.id]: { date, classification } }))

    // Auto-advance to the next lead without a date assigned yet.
    const nextUnassigned = leads.find((l) => l.id !== activeLead.id && !assignments[l.id])
    if (nextUnassigned) {
      setActiveLeadId(nextUnassigned.id)
    }
  }

  function handleApplyToRemaining() {
    if (!activeLead) return
    const activeAssignment = assignments[activeLead.id]
    if (!activeAssignment) return
    setAssignments((prev) => {
      const updated = { ...prev }
      for (const lead of leads) {
        if (!updated[lead.id]) updated[lead.id] = activeAssignment
      }
      return updated
    })
  }

  function handleSubmit() {
    const batch = Object.entries(assignments).map(([leadId, a]) => ({ leadId, date: a.date }))
    if (batch.length === 0) return

    startTransition(async () => {
      try {
        const { results } = await rescheduleLeadsBatch(batch)
        setResults(results)
      } catch {
        toast.error('Error de red al reagendar el grupo. Inténtalo de nuevo.')
      }
    })
  }

  function handleClose() {
    router.refresh()
    reset()
    onOpenChange(false)
  }

  const unassignedCount = leads.length - assignedCount

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        {results ? (
          <>
            <DialogHeader>
              <DialogTitle>Resumen de reubicación</DialogTitle>
              <DialogDescription>Resultado por reserva.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {results.map((r) => {
                const lead = leads.find((l) => l.id === r.leadId)
                const assignment = assignments[r.leadId]
                const dateLabel = assignment
                  ? format(parseISO(assignment.date), "d 'de' MMMM", { locale: es })
                  : null

                let label: string
                let colorClass: string
                if (!r.error && r.classification === 'CONFIRMABLE') {
                  label = `Confirmado ${dateLabel}`
                  colorClass = 'text-weather-ok'
                } else if (!r.error && r.classification === 'TENTATIVE_ONLY') {
                  label = `Tentativa ${dateLabel}`
                  colorClass = 'text-muted-foreground'
                } else {
                  label = r.error ? `Sin hueco — sigue pendiente (${r.error})` : 'Sin hueco — sigue pendiente'
                  colorClass = 'text-destructive'
                }

                return (
                  <div key={r.leadId} className="flex items-center justify-between text-sm px-3 py-2 rounded-md bg-secondary">
                    <span className="text-foreground font-medium">{lead?.fullName ?? r.leadId}</span>
                    <span className={cn('font-medium', colorClass)}>{label}</span>
                  </div>
                )
              })}
            </div>

            <DialogFooter>
              <Button type="button" onClick={handleClose} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Cerrar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reubicar grupo</DialogTitle>
              <DialogDescription>
                Asigna una fecha a cada reserva. Las que no reciban fecha seguirán pendientes de reagendar.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
              {leads.map((lead) => {
                const assignment = assignments[lead.id]
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setActiveLeadId(lead.id)}
                    className={cn(
                      'flex items-center justify-between gap-2 text-left px-3 py-2 rounded-md text-sm transition-colors',
                      activeLead?.id === lead.id ? 'bg-secondary' : 'hover:bg-secondary/60'
                    )}
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="font-medium text-foreground truncate">{lead.fullName}</span>
                      <span className="text-2xs text-muted-foreground truncate">{lead.phone ?? 'sin teléfono'}</span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-2xs font-medium px-2 py-0.5 rounded-full',
                        assignment ? 'bg-green-50 text-green-700' : 'bg-secondary text-muted-foreground'
                      )}
                    >
                      {assignment ? format(parseISO(assignment.date), 'd MMM', { locale: es }) : 'sin fecha'}
                    </span>
                  </button>
                )
              })}
            </div>

            {activeLead && (
              <WeekendAvailabilityCalendar
                initialMonth={initialMonth}
                selectedDate={assignments[activeLead.id]?.date ?? null}
                onSelectDate={handleSelectDate}
              />
            )}

            {activeLead && assignments[activeLead.id] && unassignedCount > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={handleApplyToRemaining} className="self-start">
                Aplicar esta fecha a los que faltan
              </Button>
            )}

            <p className="text-2xs text-muted-foreground">
              {unassignedCount > 0
                ? `${unassignedCount} sin fecha asignada — seguirán pendientes de reagendar.`
                : 'Todos los leads tienen fecha asignada.'}
            </p>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={isPending || assignedCount === 0}
                onClick={handleSubmit}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isPending ? 'Reagendando...' : `Reagendar ${assignedCount}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
