'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { confirmLead } from '@/lib/actions/leads'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type { DateClass, LeadWithDetails } from '@/types/domain'

interface ConfirmReservationModalProps {
  lead: LeadWithDetails
  classification: DateClass | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConfirmReservationModal({
  lead,
  classification,
  open,
  onOpenChange,
}: ConfirmReservationModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!lead.preferredDate) return null

  const dateLabel = format(parseISO(lead.preferredDate), "EEEE d 'de' MMMM", { locale: es })
  const timeLabel = lead.preferredTime ? lead.preferredTime.slice(0, 5) : 'sin hora preferida'
  const isTentative = classification === 'TENTATIVE_ONLY'

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await confirmLead(lead.id, lead.preferredDate as string)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.classification === 'CONFIRMABLE') {
        toast.success(`${lead.fullName} confirmado al manifest del ${dateLabel}`)
      } else if (result.classification === 'TENTATIVE_ONLY') {
        toast.info(`${lead.fullName} queda como tentativa para ${dateLabel}`)
      } else {
        toast.error('La fecha ya no está disponible — elige otra con "Reagendar".')
        onOpenChange(false)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar reserva</DialogTitle>
          <DialogDescription>
            {isTentative
              ? 'Esta fecha es de un mes futuro: el lead quedará en estado Tentativa y se intentará confirmar automáticamente cuando llegue el mes.'
              : 'Se asignará un vuelo real en el manifest de ese día.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-secondary px-3 py-2.5 text-sm">
          <div className="font-semibold text-foreground">{lead.fullName}</div>
          <div className="text-muted-foreground capitalize">
            {dateLabel} · {timeLabel}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isPending ? 'Confirmando...' : isTentative ? 'Marcar como tentativa' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
