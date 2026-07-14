'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Users, ExternalLink } from 'lucide-react'
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

/**
 * Column widths shared by the header row and every data row — colocated so
 * they can't drift apart. The actions column is fixed-width on purpose:
 * with a flex-1 client column, a variable-width trailing column would shift
 * every fixed column per-row and break the table alignment.
 */
const COL = {
  jump: 'w-20 flex-shrink-0',
  status: 'w-28 flex-shrink-0',
  payment: 'w-24 flex-shrink-0',
  contact: 'w-20 flex-shrink-0',
  actions: 'w-40 flex-shrink-0 flex items-center justify-end gap-2',
} as const

/** Column header — rendered once by ReservationsView above the row list. */
export function ReservationListHeader({ tab }: { tab: LeadFilter }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div className="flex-1 min-w-0">Cliente</div>
      <div className={COL.jump}>Salto</div>
      <div className={COL.status}>{tab === 'pending' ? 'Disponibilidad' : 'Estado'}</div>
      <div className={COL.payment}>Pago</div>
      <div className={COL.contact}>Contacto</div>
      <div className={COL.actions} aria-hidden />
    </div>
  )
}

function formatDate(date: string | null): string {
  if (!date) return '(sin fecha)'
  return format(parseISO(date), 'd MMM', { locale: es })
}

function formatTime(time: string | null): string {
  if (!time) return '–'
  return time.slice(0, 5)
}

/**
 * Payment badge derived from the lead's registered payments (never stored):
 * a LIQUIDACION-stage payment means settled; any money in means a deposit
 * is secured; otherwise nothing paid. deposit_paid is intentionally NOT
 * consulted here — it is itself derived from RESERVA payments
 * (syncDepositPaid), so payments are the single source of truth.
 */
function paymentBadge(lead: LeadWithDetails): { label: string; className: string } {
  const settled = lead.payments.some((p) => p.stage === 'LIQUIDACION')
  if (lead.paidTotal > 0 && settled) {
    return { label: `Pagado ${lead.paidTotal}€`, className: 'bg-emerald-50 text-emerald-600' }
  }
  if (lead.paidTotal > 0) {
    return { label: `Depósito ${lead.paidTotal}€`, className: 'bg-amber-50 text-amber-600' }
  }
  return { label: 'Sin pago', className: 'bg-secondary text-muted-foreground' }
}

interface ReservationRowProps {
  lead: LeadWithDetails
  tab: LeadFilter
  classification: DateClass | null
  /** Opens the lead detail sheet (LeadSheet) for this row. */
  onOpenDetail?: () => void
}

export function ReservationRow({ lead, tab, classification, onOpenDetail }: ReservationRowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)

  // A group-of-1 is structural (it carries `source`); only 2+ real members
  // or an explicit payer mean this person actually comes in a group.
  const hasGroup = lead.groupSize >= 2 || !!lead.reservationGroup?.payerName
  // CRM P0 — aging: only leads awaiting staff action go cold (TENTATIVE
  // waits for its month, not for a human; CONFIRMED aging is informational).
  const awaitingStaff = lead.leadStatus === 'NEW' || lead.leadStatus === 'RESCHEDULE_NEEDED'
  const isCold = awaitingStaff && isLeadCold(lead.lastContactAt)
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

  const jumpDate = tab === 'pending' ? lead.preferredDate : lead.confirmedDate ?? lead.preferredDate
  const jumpTime = tab === 'pending' ? lead.preferredTime : lead.confirmedTime ?? lead.preferredTime
  const payment = paymentBadge(lead)

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
    <div
      className={`flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-lg transition-colors ${
        onOpenDetail ? 'cursor-pointer hover:border-primary/40' : ''
      }`}
      onClick={onOpenDetail}
    >
      {/* Cliente */}
      <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
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
              title={
                lead.groupSize >= 2
                  ? `Grupo de ${lead.groupSize}`
                  : `Grupo · pagador: ${lead.reservationGroup?.payerName}`
              }
            >
              <Users size={12} /> {lead.groupSize >= 2 ? `Grupo · ${lead.groupSize}` : 'Grupo'}
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

      {/* Salto — date + time stacked */}
      <div className={COL.jump}>
        <div className="text-sm text-foreground">{formatDate(jumpDate)}</div>
        <div className="text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          {tab === 'pending' ? (
            <InlineField
              value={lead.preferredTime?.slice(0, 5) ?? ''}
              placeholder="–"
              onSave={(v) => saveField({ preferredTime: v || null })}
              inputType="time"
            />
          ) : (
            formatTime(jumpTime)
          )}
        </div>
      </div>

      {/* Estado / disponibilidad */}
      <div className={COL.status}>
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

      {/* Pago */}
      <div className={COL.payment}>
        <span
          className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${payment.className}`}
        >
          {payment.label}
        </span>
      </div>

      {/* Último contacto */}
      <div className={COL.contact} title="Tiempo desde el último contacto con el cliente">
        {isCold ? (
          <span
            className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
              agingCritical ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            {formatAging(lead.lastContactAt)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{formatAging(lead.lastContactAt)}</span>
        )}
      </div>

      {/* Acciones */}
      <div className={COL.actions} onClick={(e) => e.stopPropagation()}>
        {tab === 'pending' && (
          <>
            {canConfirmDirectly && (
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={isPending}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Confirmar
              </button>
            )}
            {needsReschedule && (
              <button
                onClick={() => setRescheduleOpen(true)}
                disabled={isPending}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
              >
                Reagendar
              </button>
            )}
            {!lead.preferredDate && (
              <button
                onClick={() => setCompleteOpen(true)}
                disabled={isPending}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
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
        {tab === 'confirmed' && lead.confirmedDate && (
          <Link
            href={`/${lead.confirmedDate}?highlight=${lead.id}`}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors"
            title="Ver este participante en el manifest del día"
          >
            <ExternalLink size={12} /> Manifest
          </Link>
        )}
        {tab === 'cancelled' && (
          <button
            onClick={handleReactivate}
            disabled={isPending}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
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
