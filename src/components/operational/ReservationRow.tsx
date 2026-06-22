'use client'

import { useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { cancelLead, type LeadFilter } from '@/lib/actions/leads'
import { AvailabilityBadge, LeadStatusBadge } from '@/components/operational/ReservationStatusBadge'
import { ConfirmReservationModal } from '@/components/operational/ConfirmReservationModal'
import { RescheduleReservationModal } from '@/components/operational/RescheduleReservationModal'
import type { DateClass, LeadWithDetails } from '@/types/domain'

function formatDate(date: string | null): string {
  if (!date) return '(sin fecha)'
  return format(parseISO(date), 'd MMM', { locale: es })
}

function formatTime(time: string | null): string {
  if (!time) return '–'
  return time.slice(0, 5)
}

interface ReservationRowProps {
  lead: LeadWithDetails
  tab: LeadFilter
  classification: DateClass | null
}

export function ReservationRow({ lead, tab, classification }: ReservationRowProps) {
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)

  const hasGroup = !!lead.reservationGroupId
  const canConfirmDirectly =
    tab === 'pending' &&
    !!lead.preferredDate &&
    (classification === 'CONFIRMABLE' || classification === 'TENTATIVE_ONLY')
  const needsReschedule =
    tab === 'pending' &&
    !!lead.preferredDate &&
    (classification === 'UNAVAILABLE' || classification === 'NOT_OPERATING' || lead.leadStatus === 'RESCHEDULE_NEEDED')

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelLead(lead.id)
      if (result.error) toast.error(result.error)
      else toast.success(`Reserva de ${lead.fullName} cancelada`)
    })
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">{lead.fullName}</span>
          {hasGroup && (
            <span
              className="inline-flex items-center gap-1 text-2xs text-muted-foreground"
              title="Viene en grupo"
            >
              <Users size={12} /> Grupo
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {lead.phone ?? lead.email ?? 'Sin contacto'}
        </div>
      </div>

      <div className="w-20 text-sm text-foreground flex-shrink-0">
        {formatDate(tab === 'pending' ? lead.preferredDate : lead.confirmedDate ?? lead.preferredDate)}
      </div>
      <div className="w-14 text-sm text-muted-foreground flex-shrink-0">
        {formatTime(tab === 'pending' ? lead.preferredTime : lead.confirmedTime ?? lead.preferredTime)}
      </div>

      <div className="w-32 flex-shrink-0">
        {tab === 'pending' ? (
          <AvailabilityBadge classification={lead.preferredDate ? classification : null} />
        ) : (
          lead.leadStatus && <LeadStatusBadge status={lead.leadStatus} />
        )}
      </div>

      <div className="flex-shrink-0 flex items-center gap-2">
        {tab === 'pending' && (
          <>
            {canConfirmDirectly && (
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Confirmar
              </button>
            )}
            {needsReschedule && (
              <button
                onClick={() => setRescheduleOpen(true)}
                disabled={isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
              >
                Reagendar
              </button>
            )}
            {!lead.preferredDate && (
              <button
                disabled
                title="Próximamente: completar datos del lead"
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-secondary text-muted-foreground cursor-not-allowed"
              >
                Completar
              </button>
            )}
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {lead.preferredDate && (
        <ConfirmReservationModal
          lead={lead}
          classification={classification}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
        />
      )}
      <RescheduleReservationModal lead={lead} open={rescheduleOpen} onOpenChange={setRescheduleOpen} />
    </div>
  )
}
