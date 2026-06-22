/**
 * ReservationStatusBadge — status pills for /reservas.
 *
 * Two flavors, same visual language as ParticipantRow's StatusBadge:
 *   - AvailabilityBadge: shown in the "Pendientes" tab, reflects the live
 *     classification of the lead's preferred date (CONFIRMABLE / TENTATIVE_ONLY /
 *     UNAVAILABLE / NOT_OPERATING), or "Sin fecha" if none is set yet.
 *   - LeadStatusBadge: shown in "Confirmadas" / "Canceladas", reflects the
 *     stored lead_status itself.
 */

import type { DateClass, LeadStatus } from '@/types/domain'

function Pill({ className, label }: { className: string; label: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>
      {label}
    </span>
  )
}

const AVAILABILITY_CONFIG: Record<DateClass, { label: string; className: string }> = {
  CONFIRMABLE: { label: 'Libre', className: 'bg-green-50 text-green-600' },
  TENTATIVE_ONLY: { label: 'Tentativa', className: 'bg-amber-50 text-amber-600' },
  UNAVAILABLE: { label: 'Conflicto', className: 'bg-red-50 text-red-600' },
  NOT_OPERATING: { label: 'No operativo', className: 'bg-secondary text-muted-foreground' },
}

const NO_DATE_CONFIG = { label: 'Sin fecha', className: 'bg-secondary text-muted-foreground' }

export function AvailabilityBadge({ classification }: { classification: DateClass | null }) {
  const cfg = classification ? AVAILABILITY_CONFIG[classification] : NO_DATE_CONFIG
  return <Pill className={cfg.className} label={cfg.label} />
}

const LEAD_STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  NEW: { label: 'Nueva', className: 'bg-blue-50 text-blue-600' },
  TENTATIVE: { label: 'Tentativa', className: 'bg-amber-50 text-amber-600' },
  CONFIRMED: { label: 'Confirmada', className: 'bg-green-50 text-green-600' },
  RESCHEDULE_NEEDED: { label: 'Reagendar', className: 'bg-orange-50 text-orange-600' },
  CANCELLED: { label: 'Cancelada', className: 'bg-secondary text-muted-foreground' },
  NO_SHOW: { label: 'No show', className: 'bg-red-50 text-red-600' },
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const cfg = LEAD_STATUS_CONFIG[status]
  return <Pill className={cfg.className} label={cfg.label} />
}
