'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { createParticipant } from '@/lib/actions/participant'
import { createLead, findActiveLeadByPhone, type ActiveLeadMatch } from '@/lib/actions/leads'
import { getDayOccupancy, type DayOccupancySlot } from '@/lib/actions/availability'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Channel, Instructor, ReservationSource } from '@/types/domain'
import { RESERVATION_SOURCES, RESERVATION_SOURCE_LABELS } from '@/types/domain'

// Staff-entered leads only — WEB_BOT/WHATSAPP_BOT come exclusively from the
// bot API (route.ts), never from this manual-intake form.
const STAFF_CHANNELS: Channel[] = ['STAFF', 'STAFF_PHONE', 'STAFF_WHATSAPP']
const STAFF_CHANNEL_LABELS: Record<'STAFF' | 'STAFF_PHONE' | 'STAFF_WHATSAPP', string> = {
  STAFF: 'Presencial / sin detalle',
  STAFF_PHONE: 'Teléfono',
  STAFF_WHATSAPP: 'WhatsApp',
}

const schema = z.object({
  fullName: z.string().min(1, 'Nombre requerido'),
  phone: z.string().optional(),
  email: z.string().optional(),
  source: z.enum(RESERVATION_SOURCES as [ReservationSource, ...ReservationSource[]]),
  channel: z.enum(STAFF_CHANNELS as [Channel, ...Channel[]]),
  packageType: z.enum(['SOLO', 'HANDYCAM', 'VIDEO_EXTERNO', 'FOTOS', 'HANDYCAM_FOTOS']),
  weight: z.string().optional(),
  assignedInstructorId: z.string().optional(),
  payerName: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const DUPLICATE_STATUS_LABELS: Record<ActiveLeadMatch['leadStatus'], string> = {
  NEW: 'pendiente',
  TENTATIVE: 'tentativa',
  CONFIRMED: 'confirmada',
  RESCHEDULE_NEEDED: 'por reagendar',
  CANCELLED: 'cancelada',
  NO_SHOW: 'no-show',
}

const PACKAGE_LABELS = {
  SOLO: 'Solo (sin video)',
  HANDYCAM: 'Handycam',
  VIDEO_EXTERNO: 'Videógrafo externo',
  FOTOS: 'Fotos',
  HANDYCAM_FOTOS: 'Handycam + Fotos',
}

interface AddParticipantDrawerProps {
  flightId: string | null
  instructors: Instructor[]
  onClose: () => void
  onSuccess: () => void
  /** 'lead' creates a participant with flightId NULL + lead_status NEW instead of assigning it to a flight. */
  mode?: 'participant' | 'lead'
  /** Required when mode='lead' — flightId is always null for a lead, so open is controlled separately. */
  open?: boolean
}

export function AddParticipantDrawer({
  flightId,
  instructors,
  onClose,
  onSuccess,
  mode = 'participant',
  open,
}: AddParticipantDrawerProps) {
  const [isPending, startTransition] = useTransition()
  const isLead = mode === 'lead'

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      source: 'DIRECT',
      channel: 'STAFF',
      packageType: 'SOLO',
    },
  })

  const source = form.watch('source')
  const preferredDate = isLead ? form.watch('preferredDate') : undefined
  const preferredTime = isLead ? form.watch('preferredTime') : undefined

  const [occupancy, setOccupancy] = useState<DayOccupancySlot[] | null>(null)

  // CRM P0 — possible-duplicate hint: debounced lookup of an active lead
  // with the same (normalized) phone. Informative only, never blocks submit
  // — the staff decides (e.g. a parent booking for two kids from one phone).
  const phoneValue = isLead ? form.watch('phone') : undefined
  const [possibleDuplicate, setPossibleDuplicate] = useState<ActiveLeadMatch | null>(null)

  useEffect(() => {
    if (!isLead || !phoneValue || phoneValue.trim().length < 9) {
      setPossibleDuplicate(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      findActiveLeadByPhone(phoneValue)
        .then(({ lead }) => {
          if (!cancelled) setPossibleDuplicate(lead)
        })
        .catch(() => {
          if (!cancelled) setPossibleDuplicate(null)
        })
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isLead, phoneValue])

  useEffect(() => {
    if (!isLead || !preferredDate) {
      setOccupancy(null)
      return
    }
    let cancelled = false
    setOccupancy(null)
    getDayOccupancy(preferredDate)
      .then((slots) => {
        if (!cancelled) setOccupancy(slots)
      })
      .catch(() => {
        if (!cancelled) setOccupancy([])
      })
    return () => {
      cancelled = true
    }
  }, [isLead, preferredDate])

  const fullSlotAtPreferredTime =
    preferredTime && occupancy
      ? occupancy.find((s) => s.time === preferredTime && s.active >= s.max)
      : undefined

  function handleClose() {
    form.reset()
    onClose()
  }

  function onSubmit(values: FormValues) {
    if (!isLead && !flightId) return
    startTransition(async () => {
      const rawWeight = parseFloat(values.weight ?? '')
      const weight = isNaN(rawWeight) ? undefined : rawWeight

      if (isLead) {
        if (!values.preferredDate) {
          toast.error('La fecha preferida es obligatoria')
          return
        }
        const result = await createLead({
          fullName: values.fullName,
          phone: values.phone || null,
          email: values.email || null,
          packageType: values.packageType,
          weight: weight ?? null,
          source: values.source,
          payerName: values.payerName || null,
          preferredDate: values.preferredDate,
          preferredTime: values.preferredTime || null,
          channel: values.channel,
        })
        if (result.error) {
          toast.error(result.error)
        } else {
          form.reset()
          onSuccess()
        }
        return
      }

      const result = await createParticipant(flightId as string, {
        fullName: values.fullName,
        phone: values.phone || null,
        email: values.email || null,
        packageType: values.packageType,
        weight: weight ?? null,
        assignedInstructorId: values.assignedInstructorId || null,
        source: values.source,
        payerName: values.payerName || null,
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        form.reset()
        onSuccess()
      }
    })
  }

  const dialogOpen = isLead ? !!open : flightId !== null

  return (
    <Dialog open={dialogOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isLead ? 'Nueva reserva' : 'Añadir participante'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-sm">Nombre *</Label>
            <Input
              {...form.register('fullName')}
              placeholder="Nombre completo"
            />
            {form.formState.errors.fullName && (
              <p className="text-destructive text-xs">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Teléfono</Label>
              <Input
                {...form.register('phone')}
                placeholder="600 000 000"
              />
              {possibleDuplicate && (
                <div className="flex items-start gap-1.5 text-2xs text-state-warning">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    Posible duplicado: <span className="font-semibold">{possibleDuplicate.fullName}</span>
                    {(() => {
                      const date = possibleDuplicate.confirmedDate ?? possibleDuplicate.preferredDate
                      return date ? ` — ${format(parseISO(date), 'EEE d MMM', { locale: es })}` : ''
                    })()}{' '}
                    ({DUPLICATE_STATUS_LABELS[possibleDuplicate.leadStatus]})
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input
                {...form.register('email')}
                type="email"
                placeholder="correo@ejemplo.com"
              />
            </div>
          </div>

          {/* Source + Package */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Fuente de reserva</Label>
              <Select
                value={form.watch('source')}
                onValueChange={(v) => form.setValue('source', v as FormValues['source'])}
              >
                <SelectTrigger>
                  {/* Base UI renders the raw value by default; show the label */}
                  <SelectValue>{RESERVATION_SOURCE_LABELS[form.watch('source')]}</SelectValue>
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
            <div className="space-y-1.5">
              <Label className="text-sm">Paquete</Label>
              <Select
                value={form.watch('packageType')}
                onValueChange={(v) => form.setValue('packageType', v as FormValues['packageType'])}
              >
                <SelectTrigger>
                  <SelectValue />
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
          </div>

          {/* Contact channel (staff-entered leads only) */}
          {isLead && (
            <div className="space-y-1.5">
              <Label className="text-sm">Canal de contacto</Label>
              <Select
                value={form.watch('channel')}
                onValueChange={(v) => form.setValue('channel', v as FormValues['channel'])}
              >
                <SelectTrigger>
                  <SelectValue>
                    {STAFF_CHANNEL_LABELS[form.watch('channel') as keyof typeof STAFF_CHANNEL_LABELS]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STAFF_CHANNELS.map((val) => (
                    <SelectItem key={val} value={val}>
                      {STAFF_CHANNEL_LABELS[val as keyof typeof STAFF_CHANNEL_LABELS]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Payer name (if grouped source) */}
          {source !== 'DIRECT' && (
            <div className="space-y-1.5">
              <Label className="text-sm">Nombre del pagador (grupo)</Label>
              <Input
                {...form.register('payerName')}
                placeholder="Opcional"
              />
            </div>
          )}

          {/* Weight + Instructor (instructor not relevant before a lead has a flight) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Peso (kg)</Label>
              <Input
                {...form.register('weight')}
                type="number"
                placeholder="75"
                min={1}
                max={400}
              />
            </div>
            {!isLead && (
              <div className="space-y-1.5">
                <Label className="text-sm">Instructor</Label>
                <Select
                  value={form.watch('assignedInstructorId') ?? ''}
                  onValueChange={(v) => form.setValue('assignedInstructorId', v || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" className="text-muted-foreground">
                      Sin asignar
                    </SelectItem>
                    {instructors
                      .filter((i) => i.active)
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Preferred date/time (lead only) */}
          {isLead && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Fecha preferida *</Label>
                  <Input {...form.register('preferredDate')} type="date" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Hora preferida</Label>
                  <Input {...form.register('preferredTime')} type="time" placeholder="Opcional" />
                </div>
              </div>

              {/* Occupancy hint — informative only, does not block submit */}
              {occupancy && occupancy.length > 0 && (
                <div className="flex flex-wrap gap-1.5 overflow-x-auto">
                  {occupancy.map((slot) => {
                    const full = slot.active >= slot.max
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => form.setValue('preferredTime', slot.time)}
                        className={cn(
                          'text-2xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap',
                          full
                            ? 'bg-secondary border-border text-muted-foreground'
                            : 'bg-weather-ok-bg border-state-success text-weather-ok'
                        )}
                      >
                        {slot.time} · {slot.active}/{slot.max}
                      </button>
                    )
                  })}
                </div>
              )}

              {fullSlotAtPreferredTime && (
                <div className="flex items-start gap-1.5 text-2xs text-state-warning">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    Esa hora está completa ({fullSlotAtPreferredTime.active}/{fullSlotAtPreferredTime.max}): se
                    creará un vuelo nuevo a esa hora, o elige un hueco libre.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              className="flex-1 text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isPending ? 'Añadiendo...' : 'Añadir'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
