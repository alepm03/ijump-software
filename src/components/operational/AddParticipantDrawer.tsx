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
import { findActiveLeadByPhone, type ActiveLeadMatch } from '@/lib/actions/leads'
import { createGroupLead, type GroupCompanionInput } from '@/lib/actions/group'
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
import type { Channel, Instructor, PackageType, ReservationSource } from '@/types/domain'
import { RESERVATION_SOURCES, RESERVATION_SOURCE_LABELS, PACKAGE_LABELS } from '@/types/domain'

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
  isMinor: z.boolean().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

/**
 * A companion row in the intake form. Name, weight and package only: the
 * organizer holds the booking's contact data, and asking companions for a
 * phone they'll never be called on is friction for nothing.
 */
type CompanionDraft = {
  fullName: string
  weight: string
  packageType: PackageType
  isMinor: boolean
}


const DUPLICATE_STATUS_LABELS: Record<ActiveLeadMatch['leadStatus'], string> = {
  NEW: 'pendiente',
  TENTATIVE: 'tentativa',
  CONFIRMED: 'confirmada',
  RESCHEDULE_NEEDED: 'por reagendar',
  CANCELLED: 'cancelada',
  NO_SHOW: 'no-show',
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

  const preferredDate = isLead ? form.watch('preferredDate') : undefined
  const preferredTime = isLead ? form.watch('preferredTime') : undefined

  const [occupancy, setOccupancy] = useState<DayOccupancySlot[] | null>(null)

  // CRM P0 — possible-duplicate hint: debounced lookup of an active lead
  // with the same (normalized) phone. Informative only, never blocks submit
  // — the staff decides (e.g. a parent booking for two kids from one phone).
  const phoneValue = isLead ? form.watch('phone') : undefined
  const [possibleDuplicate, setPossibleDuplicate] = useState<ActiveLeadMatch | null>(null)
  const [companions, setCompanions] = useState<CompanionDraft[]>([])

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
    setCompanions([])
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
        // Always through createGroupLead, even for one person: a booking is a
        // booking of 1..N, and going through one path means the organizer
        // flag and the group row are set the same way everywhere.
        const named = companions.filter((c) => c.fullName.trim())
        const result = await createGroupLead({
          fullName: values.fullName,
          phone: values.phone || null,
          email: values.email || null,
          packageType: values.packageType,
          weight: weight ?? null,
          isMinor: values.isMinor,
          source: values.source,
          preferredDate: values.preferredDate,
          preferredTime: values.preferredTime || null,
          channel: values.channel,
          companions: named.map((c): GroupCompanionInput => {
            const w = parseFloat(c.weight)
            return {
              fullName: c.fullName.trim(),
              weight: isNaN(w) ? null : w,
              packageType: c.packageType,
              isMinor: c.isMinor,
            }
          }),
        })
        if (result.error) {
          toast.error(result.error)
        } else {
          if (result.isEvent) {
            toast.warning(
              `Reserva de ${result.partySize} personas anotada como EVENTO: hay que confirmarla expresamente con el cliente.`
            )
          } else if ((result.partySize ?? 1) > 1) {
            toast.success(`Reserva de ${result.partySize} personas creada`)
          }
          form.reset()
          setCompanions([])
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

          {/* Acompañantes — solo en alta de reserva. Sustituye al antiguo campo
              de texto "pagador", que no creaba miembros reales: ahora el grupo
              tiene participantes de verdad, cada uno con su plaza y su waiver. */}
          {isLead && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">
                  Acompañantes
                  {companions.length > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {' '}· reserva de {companions.length + 1} personas
                    </span>
                  )}
                </Label>
                <button
                  type="button"
                  onClick={() =>
                    setCompanions((prev) => [
                      ...prev,
                      { fullName: '', weight: '', packageType: form.getValues('packageType'), isMinor: false },
                    ])
                  }
                  className="text-xs font-semibold px-2 py-1 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors"
                >
                  + Añadir
                </button>
              </div>

              {companions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Solo hace falta el nombre y el peso de cada uno. El teléfono y el email son los de
                  quien reserva.
                </p>
              ) : (
                companions.map((companion, index) => (
                  <div key={index} className="space-y-1.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
                    <div className="grid grid-cols-[1fr_5rem_auto] gap-2 items-end">
                      <Input
                        value={companion.fullName}
                        onChange={(e) =>
                          setCompanions((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, fullName: e.target.value } : c))
                          )
                        }
                        placeholder={`Acompañante ${index + 1}`}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        value={companion.weight}
                        onChange={(e) =>
                          setCompanions((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, weight: e.target.value } : c))
                          )
                        }
                        placeholder="kg"
                        className="h-8 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setCompanions((prev) => prev.filter((_, i) => i !== index))}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors pb-1.5"
                      >
                        Quitar
                      </button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                      <Select
                        value={companion.packageType}
                        onValueChange={(v) =>
                          setCompanions((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, packageType: v as PackageType } : c))
                          )
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue>{PACKAGE_LABELS[companion.packageType]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PACKAGE_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={companion.isMinor}
                          onChange={(e) =>
                            setCompanions((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, isMinor: e.target.checked } : c))
                            )
                          }
                          className="accent-primary"
                        />
                        Menor
                      </label>
                    </div>
                  </div>
                ))
              )}

              {companions.length + 1 >= 10 && (
                <p className="text-xs text-amber-600">
                  A partir de 10 personas es un evento: confírmalo expresamente con el cliente antes
                  de dar la fecha por buena.
                </p>
              )}
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
                    Esa hora está completa ({fullSlotAtPreferredTime.active}/{fullSlotAtPreferredTime.max}): la
                    reserva quedará en conflicto y no podrás confirmarla hasta que haya hueco a esa hora. Elige
                    otra hora o déjala vacía (cualquier hora).
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
