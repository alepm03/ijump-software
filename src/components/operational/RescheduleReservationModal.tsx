'use client'

/**
 * RescheduleReservationModal — pick a new date AND hour for a lead.
 *
 * Two-step flow inside one dialog: (1) pick a day with room in the
 * availability calendar, (2) pick the hour — a concrete time, or "any hour"
 * (preferred_time NULL → reservations_assign_seat seats them in the first
 * flight of the day with a free seat; see the 20260715 migration). Confirm
 * closes the whole process.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { rescheduleLead } from '@/lib/actions/leads'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { WeekendAvailabilityCalendar } from '@/components/operational/WeekendAvailabilityCalendar'
import type { DateClass, LeadWithDetails } from '@/types/domain'

interface RescheduleReservationModalProps {
  lead: LeadWithDetails
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RescheduleReservationModal({
  lead,
  open,
  onOpenChange,
}: RescheduleReservationModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<DateClass | null>(null)
  const [timeMode, setTimeMode] = useState<'any' | 'specific'>('any')
  const [time, setTime] = useState<string>(lead.preferredTime?.slice(0, 5) ?? '')

  function reset() {
    setSelectedDate(null)
    setSelectedClass(null)
    setTimeMode('any')
    setError(null)
  }

  function handleSelectDate(date: string, classification: DateClass) {
    setSelectedDate(date)
    setSelectedClass(classification)
    setError(null)
  }

  const needsTime = timeMode === 'specific' && !time
  const canConfirm = !!selectedDate && !needsTime

  function handleConfirm() {
    if (!selectedDate || !canConfirm) return
    setError(null)
    startTransition(async () => {
      const result = await rescheduleLead(
        lead.id,
        selectedDate,
        timeMode === 'any' ? null : time
      )
      if (result.error) {
        setError(result.error)
        return
      }
      const dateLabel = format(parseISO(selectedDate), "d 'de' MMMM", { locale: es })
      const timeLabel = timeMode === 'any' ? 'primer vuelo con hueco' : `${time}h`
      if (result.classification === 'CONFIRMABLE') {
        toast.success(`${lead.fullName} reagendado al ${dateLabel} · ${timeLabel}`)
      } else if (result.classification === 'TENTATIVE_ONLY') {
        toast.info(`${lead.fullName} queda como tentativa para ${dateLabel}`)
      } else {
        toast.error('Esa fecha ya no tiene hueco — elige otra.')
        return
      }
      onOpenChange(false)
      reset()
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reagendar reserva</DialogTitle>
          <DialogDescription>
            Elige una fecha con hueco para <span className="font-medium text-foreground">{lead.fullName}</span>.
          </DialogDescription>
        </DialogHeader>

        <WeekendAvailabilityCalendar
          initialMonth={lead.preferredDate?.slice(0, 7)}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />

        {selectedDate && selectedClass !== 'TENTATIVE_ONLY' && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              Hora del {format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es })}:
            </p>
            <label
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer ${
                timeMode === 'any' ? 'border-primary/40 bg-secondary/40' : 'border-border hover:bg-secondary/50'
              }`}
            >
              <input
                type="radio"
                name="reschedule-time-mode"
                checked={timeMode === 'any'}
                onChange={() => setTimeMode('any')}
                className="accent-primary"
              />
              <span className="text-foreground">Cualquier hora — primer vuelo con hueco</span>
            </label>
            <label
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer ${
                timeMode === 'specific' ? 'border-primary/40 bg-secondary/40' : 'border-border hover:bg-secondary/50'
              }`}
            >
              <input
                type="radio"
                name="reschedule-time-mode"
                checked={timeMode === 'specific'}
                onChange={() => setTimeMode('specific')}
                className="accent-primary"
              />
              <span className="text-foreground flex-1">Hora concreta</span>
              {timeMode === 'specific' && (
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-7 w-24 text-sm tabular-nums"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </label>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isPending || !canConfirm}
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isPending
              ? 'Reagendando...'
              : selectedClass === 'TENTATIVE_ONLY'
                ? 'Marcar como tentativa'
                : 'Aceptar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
