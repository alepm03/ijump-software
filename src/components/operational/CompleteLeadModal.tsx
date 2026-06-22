'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { setPreferredDate } from '@/lib/actions/leads'
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
import type { LeadWithDetails } from '@/types/domain'

interface CompleteLeadModalProps {
  lead: LeadWithDetails
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** For leads created without a date (e.g. a bare phone inquiry) — sets preferred_date so it surfaces in the normal confirm/reschedule flow. */
export function CompleteLeadModal({ lead, open, onOpenChange }: CompleteLeadModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  function handleConfirm() {
    if (!selectedDate) return
    setError(null)
    startTransition(async () => {
      const result = await setPreferredDate(lead.id, selectedDate)
      if (result.error) {
        setError(result.error)
        return
      }
      const dateLabel = format(parseISO(selectedDate), "d 'de' MMMM", { locale: es })
      toast.success(`${lead.fullName} marcado para el ${dateLabel}`)
      onOpenChange(false)
      setSelectedDate(null)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Completar reserva</DialogTitle>
          <DialogDescription>
            Elige la fecha deseada para <span className="font-medium text-foreground">{lead.fullName}</span>.
          </DialogDescription>
        </DialogHeader>

        <WeekendAvailabilityCalendar
          selectedDate={selectedDate}
          onSelectDate={(date: string) => {
            setSelectedDate(date)
            setError(null)
          }}
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
            {isPending ? 'Guardando...' : 'Guardar fecha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
