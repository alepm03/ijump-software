'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createParticipant } from '@/lib/actions/participant'
import { createLead } from '@/lib/actions/leads'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type { Instructor } from '@/types/domain'

const schema = z.object({
  fullName: z.string().min(1, 'Nombre requerido'),
  phone: z.string().optional(),
  email: z.string().optional(),
  source: z.enum(['DIRECT', 'GROUPON', 'BONO', 'PROMO', 'SMARTBOX']),
  packageType: z.enum(['SOLO', 'HANDYCAM', 'VIDEO_EXTERNO', 'FOTOS', 'HANDYCAM_FOTOS']),
  weight: z.string().optional(),
  assignedInstructorId: z.string().optional(),
  payerName: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const SOURCE_LABELS = {
  DIRECT: 'Directo',
  GROUPON: 'Groupon',
  BONO: 'Bono',
  PROMO: 'Promo',
  SMARTBOX: 'Smartbox',
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
      packageType: 'SOLO',
    },
  })

  const source = form.watch('source')

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
          channel: 'STAFF',
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
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
