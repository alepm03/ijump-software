'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { rescheduleLead } from '@/lib/actions/leads'
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

  function handleSelectDate(date: string, classification: DateClass) {
    setSelectedDate(date)
    setSelectedClass(classification)
    setError(null)
  }

  function handleConfirm() {
    if (!selectedDate) return
    setError(null)
    startTransition(async () => {
      const result = await rescheduleLead(lead.id, selectedDate)
      if (result.error) {
        setError(result.error)
        return
      }
      const dateLabel = format(parseISO(selectedDate), "d 'de' MMMM", { locale: es })
      if (result.classification === 'CONFIRMABLE') {
        toast.success(`${lead.fullName} reagendado al ${dateLabel}`)
      } else if (result.classification === 'TENTATIVE_ONLY') {
        toast.info(`${lead.fullName} queda como tentativa para ${dateLabel}`)
      } else {
        toast.error('Esa fecha ya no tiene hueco — elige otra.')
        return
      }
      onOpenChange(false)
      setSelectedDate(null)
      setSelectedClass(null)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isPending || !selectedDate}
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isPending
              ? 'Reagendando...'
              : selectedClass === 'TENTATIVE_ONLY'
                ? 'Marcar como tentativa'
                : 'Confirmar nueva fecha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
