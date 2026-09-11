'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { confirmLead } from '@/lib/actions/leads'
import { confirmGroup } from '@/lib/actions/group'
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
  // Confirming a booking confirms the whole party: with 2 seats per flight a
  // group of 4 needs two consecutive ones, and the seat assignment is
  // all-or-nothing precisely so nobody gets scattered across the day.
  const isGroup = lead.groupSize >= 2
  const who = isGroup ? `${lead.fullName} y ${lead.companions.length} más` : lead.fullName

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = isGroup && lead.reservationGroupId
        ? await confirmGroup(lead.reservationGroupId, lead.preferredDate as string)
        : await confirmLead(lead.id, lead.preferredDate as string)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.classification === 'CONFIRMABLE') {
        toast.success(`${who} confirmado al manifest del ${dateLabel}`)
      } else if (result.classification === 'TENTATIVE_ONLY') {
        toast.info(`${who} queda como tentativa para ${dateLabel}`)
      } else if ('groupDoesNotFit' in result && result.groupDoesNotFit) {
        // Distinct from a full day: the date is open, it just can't take a
        // party this size. Saying "día completo" here would be misleading.
        setError(
          `Ese día no caben ${lead.groupSize} personas juntas. Elige otra fecha con "Reagendar" o libera plazas en el manifest.`
        )
        return
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
              ? 'Esta fecha es de un mes futuro: la reserva quedará en estado Tentativa y se intentará confirmar automáticamente cuando llegue el mes.'
              : isGroup
                ? `Se asignarán ${lead.groupSize} plazas en vuelos consecutivos del manifest de ese día. O entran todos, o no entra ninguno.`
                : 'Se asignará un vuelo real en el manifest de ese día.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-secondary px-3 py-2.5 text-sm">
          <div className="font-semibold text-foreground">
            {lead.fullName}
            {isGroup && (
              <span className="font-normal text-muted-foreground"> · {lead.groupSize} personas</span>
            )}
          </div>
          <div className="text-muted-foreground capitalize">
            {dateLabel} · {timeLabel}
          </div>
          {isGroup && (
            <ul className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
              {lead.companions.map((c) => (
                <li key={c.id} className="truncate">· {c.fullName}</li>
              ))}
            </ul>
          )}
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
            {isPending
              ? 'Confirmando...'
              : isTentative
                ? 'Marcar como tentativa'
                : isGroup
                  ? `Confirmar ${lead.groupSize} plazas`
                  : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
