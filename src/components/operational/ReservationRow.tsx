'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Users, ExternalLink, ChevronRight, ChevronDown, Baby, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import { cancelLead, reactivateLead, type LeadFilter } from '@/lib/actions/leads'
import { cancelGroup, removeCompanion } from '@/lib/actions/group'
import { updateParticipant, type UpdateParticipantData } from '@/lib/actions/participant'
import { AvailabilityBadge, LeadStatusBadge } from '@/components/operational/ReservationStatusBadge'
import { ConfirmReservationModal } from '@/components/operational/ConfirmReservationModal'
import { RescheduleReservationModal } from '@/components/operational/RescheduleReservationModal'
import { CompleteLeadModal } from '@/components/operational/CompleteLeadModal'
import { InlineField } from '@/components/operational/InlineField'
import { formatAging, isLeadCold } from '@/lib/utils'
import type { DateClass, LeadWithDetails } from '@/types/domain'
import { PACKAGE_LABELS } from '@/types/domain'


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
  const [expanded, setExpanded] = useState(false)
  // Frozen on mount instead of read during render: aging is a display hint,
  // and a clock that ticks mid-render makes the component impure (the row
  // would render differently on every pass). Any navigation remounts it.
  const [now] = useState(() => Date.now())

  // This row IS the booking: listLeads collapses each reservation group into
  // its organizer's row, with the rest of the party in `companions`.
  const companions = lead.companions
  const hasGroup = lead.groupSize >= 2
  const minorsInParty = (lead.isMinor ? 1 : 0) + companions.filter((c) => c.isMinor).length
  // CRM P0 — aging: only leads awaiting staff action go cold (TENTATIVE
  // waits for its month, not for a human; CONFIRMED aging is informational).
  // NO_SHOW counts too since the "Reagendar" tab exists: rebooking a no-show
  // is staff work with the same urgency.
  const awaitingStaff =
    lead.leadStatus === 'NEW' ||
    lead.leadStatus === 'RESCHEDULE_NEEDED' ||
    lead.leadStatus === 'NO_SHOW'
  const isCold = awaitingStaff && isLeadCold(lead.lastContactAt, now)
  const agingCritical =
    !lead.lastContactAt || now - new Date(lead.lastContactAt).getTime() > AGING_CRITICAL_MS
  const canConfirmDirectly =
    tab === 'pending' &&
    !!lead.preferredDate &&
    (classification === 'CONFIRMABLE' || classification === 'TENTATIVE_ONLY')
  const needsReschedule =
    tab === 'pending' &&
    !!lead.preferredDate &&
    (classification === 'UNAVAILABLE' || classification === 'NOT_OPERATING')

  const jumpDate =
    tab === 'pending' || tab === 'reschedule'
      ? lead.preferredDate
      : lead.confirmedDate ?? lead.preferredDate
  const jumpTime =
    tab === 'pending' || tab === 'reschedule'
      ? lead.preferredTime
      : lead.confirmedTime ?? lead.preferredTime
  const payment = paymentBadge(lead)

  /**
   * Cancelling a booking cancels the whole party. Cancelling only the
   * organizer would strand the companions: they hold no phone or email of
   * their own, so nobody would know who to call. Dropping a single companion
   * is done from the booking's detail sheet instead.
   */
  function handleCancel() {
    if (hasGroup && !confirm(
      `Se cancelará la reserva completa: ${lead.fullName} y ${companions.length} acompañante${companions.length === 1 ? '' : 's'}. ¿Continuar?`
    )) return

    startTransition(async () => {
      const result = hasGroup && lead.reservationGroupId
        ? await cancelGroup(lead.reservationGroupId)
        : await cancelLead(lead.id)
      if (result.error) toast.error(result.error)
      else {
        toast.success(
          hasGroup
            ? `Reserva de ${lead.fullName} (${lead.groupSize} personas) cancelada`
            : `Reserva de ${lead.fullName} cancelada`
        )
        router.refresh()
      }
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
    <div className="bg-card border border-border rounded-lg overflow-hidden">
    <div
      className={`flex items-center gap-2 px-4 py-3 transition-colors ${
        onOpenDetail ? 'cursor-pointer hover:bg-secondary/40' : ''
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
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-primary hover:bg-secondary/70 transition-colors whitespace-nowrap"
              title={`Reserva de ${lead.groupSize} personas — ver acompañantes`}
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <Users size={11} /> {lead.groupSize}
            </button>
          )}
          {lead.isEvent && (
            <span
              className="inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 whitespace-nowrap"
              title="Grupo grande: lo tiene que confirmar el equipo expresamente, no se autoconfirma"
            >
              <PartyPopper size={11} /> Evento
            </span>
          )}
          {minorsInParty > 0 && (
            <span
              className="inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap"
              title={
                minorsInParty === 1
                  ? 'Hay un menor de edad: falta la autorización paterna firmada'
                  : `Hay ${minorsInParty} menores de edad: falta la autorización paterna firmada`
              }
            >
              <Baby size={11} /> {minorsInParty > 1 ? minorsInParty : ''} Menor{minorsInParty > 1 ? 'es' : ''}
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
          <AvailabilityBadge classification={lead.preferredDate ? classification : null} />
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
        {tab === 'reschedule' && (
          <>
            <button
              onClick={() => setRescheduleOpen(true)}
              disabled={isPending}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Reagendar
            </button>
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
            className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
          >
            Reactivar
          </button>
        )}
      </div>

      {/* Modals render in a portal, but React synthetic events still bubble
          through the COMPONENT tree — without this stopPropagation wrapper a
          click inside any modal (e.g. a calendar day) reaches the row's
          onClick above and opens the LeadSheet on top. */}
      <div onClick={(e) => e.stopPropagation()}>
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
    </div>

    {/* Acompañantes — el resto de la reserva, plegado por defecto para que la
        cola siga leyéndose como una lista de reservas y no de personas. */}
    {expanded && companions.length > 0 && (
      <div className="border-t border-border bg-secondary/30" onClick={(e) => e.stopPropagation()}>
        {companions.map((companion) => (
          <CompanionRow key={companion.id} companion={companion} />
        ))}
      </div>
    )}
    </div>
  )
}

/** One companion inside an expanded booking row. Editable in place, like the organizer. */
function CompanionRow({ companion }: { companion: LeadWithDetails }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function save(data: UpdateParticipantData) {
    startTransition(async () => {
      const result = await updateParticipant(companion.id, data)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  function handleRemove() {
    if (!confirm(`¿Quitar a ${companion.fullName} de la reserva?`)) return
    startTransition(async () => {
      const result = await removeCompanion(companion.id)
      if (result.error) toast.error(result.error)
      else {
        toast.success(`${companion.fullName} ya no forma parte de la reserva`)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-3 pl-10 pr-4 py-2 border-b border-border/50 last:border-b-0">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <InlineField
          value={companion.fullName}
          placeholder="Nombre"
          onSave={(v) => { if (v) save({ fullName: v }) }}
          className="text-sm"
        />
        {companion.isMinor && (
          <span
            className="inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700"
            title="Menor de edad: falta la autorización paterna firmada"
          >
            <Baby size={10} /> Menor
          </span>
        )}
      </div>
      <div className="w-20 flex-shrink-0 text-xs text-muted-foreground" title="Peso — fija el límite del tándem y el recargo de sobrepeso">
        <InlineField
          value={companion.weight != null ? String(companion.weight) : ''}
          placeholder="Sin peso"
          onSave={(v) => save({ weight: v ? Number(v) : null })}
          inputType="number"
        />
      </div>
      <div className="w-32 flex-shrink-0 text-xs text-muted-foreground">
        {PACKAGE_LABELS[companion.packageType]}
      </div>
      <div className="w-40 flex-shrink-0 flex justify-end">
        <button
          onClick={handleRemove}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        >
          Quitar
        </button>
      </div>
    </div>
  )
}
