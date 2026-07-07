'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { cancelLead, reactivateLead, type LeadFilter } from '@/lib/actions/leads'
import { updateParticipant, type UpdateParticipantData } from '@/lib/actions/participant'
import { AvailabilityBadge, LeadStatusBadge } from '@/components/operational/ReservationStatusBadge'
import { ConfirmReservationModal } from '@/components/operational/ConfirmReservationModal'
import { RescheduleReservationModal } from '@/components/operational/RescheduleReservationModal'
import { CompleteLeadModal } from '@/components/operational/CompleteLeadModal'
import { InlineField } from '@/components/operational/InlineField'
import { formatAging, isLeadCold } from '@/lib/utils'
import type { DateClass, LeadWithDetails } from '@/types/domain'

/** 96h with no contact escalates the aging badge from amber to red. */
const AGING_CRITICAL_MS = 96 * 60 * 60 * 1000

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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)

  const hasGroup = !!lead.reservationGroupId
  // CRM P0 — aging badge: only for leads awaiting staff action on the
  // pending tab (TENTATIVE waits for its month, not for a human).
  const showAging =
    tab === 'pending' &&
    (lead.leadStatus === 'NEW' || lead.leadStatus === 'RESCHEDULE_NEEDED') &&
    isLeadCold(lead.lastContactAt)
  const agingCritical =
    !lead.lastContactAt ||
    Date.now() - new Date(lead.lastContactAt).getTime() > AGING_CRITICAL_MS
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

  function handleReactivate() {
    startTransition(async () => {
      const result = await reactivateLead(lead.id)
      if (result.error) toast.error(result.error)
      else {
        toast.success(`Reserva de ${lead.fullName} reactivada`)
        router.refresh()
      }
    })
  }

  function saveField(data: UpdateParticipantData, successLabel?: string) {
    startTransition(async () => {
      const result = await updateParticipant(lead.id, data)
      if (result.error) toast.error(result.error)
      else {
        if (successLabel) toast.success(successLabel)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <InlineField
            value={lead.fullName}
            placeholder="Nombre"
            onSave={(v) => { if (v) saveField({ fullName: v }) }}
            className="font-semibold text-sm"
          />
          {hasGroup && (
            <span
              className="inline-flex items-center gap-1 text-2xs text-muted-foreground"
              title="Viene en grupo"
            >
              <Users size={12} /> Grupo
            </span>
          )}
          {showAging && (
            <span
              className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                agingCritical ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
              }`}
              title="Tiempo desde el último contacto con el cliente"
            >
              {formatAging(lead.lastContactAt)} sin contacto
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
          <InlineField
            value={lead.phone ?? ''}
            placeholder="Sin teléfono"
            onSave={(v) => saveField({ phone: v || null })}
            inputType="tel"
          />
          <span>·</span>
          <InlineField
            value={lead.email ?? ''}
            placeholder="Sin email"
            onSave={(v) => saveField({ email: v || null })}
            inputType="email"
          />
        </div>
      </div>

      <div className="w-20 text-sm text-foreground flex-shrink-0">
        {formatDate(tab === 'pending' ? lead.preferredDate : lead.confirmedDate ?? lead.preferredDate)}
      </div>
      <div className="w-14 text-sm text-muted-foreground flex-shrink-0">
        {tab === 'pending' ? (
          <InlineField
            value={lead.preferredTime?.slice(0, 5) ?? ''}
            placeholder="–"
            onSave={(v) => saveField({ preferredTime: v || null })}
            inputType="time"
          />
        ) : (
          formatTime(lead.confirmedTime ?? lead.preferredTime)
        )}
      </div>

      <div className="w-32 flex-shrink-0">
        {tab === 'pending' ? (
          lead.leadStatus === 'RESCHEDULE_NEEDED' ? (
            <LeadStatusBadge status="RESCHEDULE_NEEDED" />
          ) : (
            <AvailabilityBadge classification={lead.preferredDate ? classification : null} />
          )
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
                onClick={() => setCompleteOpen(true)}
                disabled={isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
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
        {tab === 'cancelled' && (
          <button
            onClick={handleReactivate}
            disabled={isPending}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
          >
            Reactivar
          </button>
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
      <CompleteLeadModal lead={lead} open={completeOpen} onOpenChange={setCompleteOpen} />
    </div>
  )
}
