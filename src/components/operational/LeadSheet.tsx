'use client'

/**
 * LeadSheet — lead detail sheet for /reservas (the "ficha de lead").
 *
 * Same visual pattern as ParticipantInfoSheet in the day manifest (Sheet
 * side="top", two columns) but with lead-lifecycle fields instead of
 * flight-operation ones: preferred/confirmed date, source, channel, lead
 * status, deposit, contact aging. Right column reuses the shared
 * NotesField (bot escalation notes land here) and PaymentManager
 * (createPayment works for leads — payments has no flight dependency).
 *
 * Controlled (open/onOpenChange): ReservationsView owns which lead is open
 * so the sheet always renders the fresh lead from the server after
 * router.refresh().
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LeadStatusBadge } from '@/components/operational/ReservationStatusBadge'
import { InlineField } from '@/components/operational/InlineField'
import { NotesField } from '@/components/operational/shared/NotesField'
import { PaymentManager } from '@/components/operational/shared/PaymentManager'
import { updateParticipant, type UpdateParticipantData } from '@/lib/actions/participant'
import {
  markLeadContacted,
  setDepositPaid,
  setPreferredDate,
  updateLeadSource,
} from '@/lib/actions/leads'
import { formatAging, isLeadCold } from '@/lib/utils'
import { RESERVATION_SOURCES, RESERVATION_SOURCE_LABELS } from '@/types/domain'
import type { Channel, LeadWithDetails, PackageType, ReservationSource } from '@/types/domain'

const PACKAGE_LABELS: Record<PackageType, string> = {
  SOLO: 'Solo (sin video)',
  HANDYCAM: 'Handycam',
  VIDEO_EXTERNO: 'Videógrafo externo',
  FOTOS: 'Fotos',
  HANDYCAM_FOTOS: 'Handycam + Fotos',
}

const CHANNEL_LABELS: Record<Channel, string> = {
  WEB_BOT: 'Web (bot)',
  WHATSAPP_BOT: 'WhatsApp (bot)',
  STAFF: 'Staff · presencial',
  STAFF_PHONE: 'Staff · teléfono',
  STAFF_WHATSAPP: 'Staff · WhatsApp',
}

function formatDateLong(date: string | null): string {
  if (!date) return 'Sin fecha'
  return format(parseISO(date), "EEEE d 'de' MMMM", { locale: es })
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>
}

interface LeadSheetProps {
  lead: LeadWithDetails | null
  onOpenChange: (open: boolean) => void
}

export function LeadSheet({ lead, onOpenChange }: LeadSheetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!lead) return null

  function run(action: () => Promise<{ error?: string }>, successLabel?: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else {
        if (successLabel) toast.success(successLabel)
        router.refresh()
      }
    })
  }

  function saveField(data: UpdateParticipantData) {
    run(() => updateParticipant(lead!.id, data))
  }

  const awaitingStaff = lead.leadStatus === 'NEW' || lead.leadStatus === 'RESCHEDULE_NEEDED'
  const cold = awaitingStaff && isLeadCold(lead.lastContactAt)

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="top" className="h-[58vh] p-0 flex flex-col gap-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 pr-8">
            <SheetTitle className="text-title font-semibold leading-tight">
              {lead.fullName || 'Sin nombre'}
            </SheetTitle>
            {lead.leadStatus && <LeadStatusBadge status={lead.leadStatus} />}
            <span
              className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                cold ? 'bg-amber-50 text-amber-600' : 'bg-secondary text-muted-foreground'
              }`}
              title="Tiempo desde el último contacto"
            >
              {formatAging(lead.lastContactAt)} desde el último contacto
            </span>
            <button
              onClick={() => run(() => markLeadContacted(lead.id), 'Contacto registrado')}
              disabled={isPending}
              className="text-xs font-semibold px-2.5 py-1 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
            >
              Contactado ahora
            </button>
          </div>
        </div>

        {/* Body — 2 columns: lead data | notes + payments */}
        <div className="flex-1 overflow-hidden grid grid-cols-[5fr_6fr] divide-x divide-border">
          {/* ── Left: lead data ── */}
          <div className="px-6 py-5 overflow-y-auto space-y-5">
            <div className="space-y-3">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                Contacto
              </p>
              <div className="flex flex-col gap-1">
                <FieldLabel>Nombre completo</FieldLabel>
                <InlineField
                  value={lead.fullName}
                  placeholder="Sin nombre"
                  onSave={(v) => { if (v) saveField({ fullName: v }) }}
                  className="text-sm font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <FieldLabel>Teléfono</FieldLabel>
                  <InlineField
                    value={lead.phone ?? ''}
                    placeholder="Sin teléfono"
                    onSave={(v) => saveField({ phone: v || null })}
                    inputType="tel"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>Email</FieldLabel>
                  <InlineField
                    value={lead.email ?? ''}
                    placeholder="Sin email"
                    onSave={(v) => saveField({ email: v || null })}
                    inputType="email"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                Reserva
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <FieldLabel>{lead.confirmedDate ? 'Fecha confirmada' : 'Fecha preferida'}</FieldLabel>
                  {lead.confirmedDate ? (
                    <span className="text-sm text-foreground">
                      {formatDateLong(lead.confirmedDate)}
                      {lead.confirmedTime ? ` · ${lead.confirmedTime.slice(0, 5)}` : ''}
                    </span>
                  ) : (
                    <input
                      type="date"
                      defaultValue={lead.preferredDate ?? ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          run(() => setPreferredDate(lead.id, e.target.value, lead.preferredTime))
                        }
                      }}
                      className="text-sm bg-background border border-input rounded px-2 py-1 focus:ring-ring w-fit"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>Hora preferida</FieldLabel>
                  <InlineField
                    value={lead.preferredTime?.slice(0, 5) ?? ''}
                    placeholder="–"
                    onSave={(v) => saveField({ preferredTime: v || null })}
                    inputType="time"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <FieldLabel>Paquete</FieldLabel>
                  <Select
                    value={lead.packageType}
                    onValueChange={(v) => saveField({ packageType: v as PackageType })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue>{PACKAGE_LABELS[lead.packageType]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PACKAGE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>Peso (kg)</FieldLabel>
                  <InlineField
                    value={lead.weight != null ? String(lead.weight) : ''}
                    placeholder="–"
                    onSave={(v) => {
                      const w = parseFloat(v)
                      saveField({ weight: isNaN(w) ? null : w })
                    }}
                    inputType="number"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <FieldLabel>Fuente de venta</FieldLabel>
                  <Select
                    value={lead.reservationGroup?.source ?? 'DIRECT'}
                    onValueChange={(v) =>
                      run(() => updateLeadSource(lead.id, v as ReservationSource))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue>
                        {RESERVATION_SOURCE_LABELS[lead.reservationGroup?.source ?? 'DIRECT']}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {RESERVATION_SOURCES.map((val) => (
                        <SelectItem key={val} value={val}>
                          {RESERVATION_SOURCE_LABELS[val]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>Canal de entrada</FieldLabel>
                  <span className="text-sm text-foreground py-1">{CHANNEL_LABELS[lead.channel]}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel>Depósito</FieldLabel>
                <button
                  onClick={() => run(() => setDepositPaid(lead.id, !lead.depositPaid))}
                  disabled={isPending}
                  className={`inline-flex items-center gap-2 w-fit text-sm px-2.5 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
                    lead.depositPaid
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-background text-muted-foreground border-input hover:bg-secondary'
                  }`}
                  title="Marca manual de depósito recibido; se activa solo al registrar un pago de reserva"
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                      lead.depositPaid ? 'bg-emerald-600 border-emerald-600' : 'border-input'
                    }`}
                  >
                    {lead.depositPaid && <Check size={10} className="text-primary-foreground" />}
                  </span>
                  {lead.depositPaid ? 'Depósito recibido' : 'Sin depósito'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Right: notes + payments ── */}
          <div className="px-6 py-5 overflow-y-auto space-y-5">
            <div className="space-y-3">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                Notas internas
              </p>
              <NotesField
                value={lead.notes ?? ''}
                onSave={(v) => saveField({ notes: v || null })}
              />
            </div>
            <div className="space-y-3">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                Pagos
              </p>
              <PaymentManager participantId={lead.id} payments={lead.payments} />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
