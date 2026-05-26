'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createParticipant } from '@/lib/actions/participant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
}

export function AddParticipantDrawer({
  flightId,
  instructors,
  onClose,
  onSuccess,
}: AddParticipantDrawerProps) {
  const [isPending, startTransition] = useTransition()

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
    if (!flightId) return
    startTransition(async () => {
      const rawWeight = parseFloat(values.weight ?? '')
      const weight = isNaN(rawWeight) ? undefined : rawWeight
      const result = await createParticipant(flightId, {
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

  return (
    <Sheet open={flightId !== null} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="bg-zinc-900 border-zinc-700 text-white w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-white">Añadir participante</SheetTitle>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Nombre *</Label>
            <Input
              {...form.register('fullName')}
              placeholder="Nombre completo"
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
            />
            {form.formState.errors.fullName && (
              <p className="text-red-400 text-xs">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Teléfono</Label>
              <Input
                {...form.register('phone')}
                placeholder="600 000 000"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Email</Label>
              <Input
                {...form.register('email')}
                type="email"
                placeholder="correo@ejemplo.com"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
              />
            </div>
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Fuente de reserva</Label>
            <Select
              value={form.watch('source')}
              onValueChange={(v) => form.setValue('source', v as FormValues['source'])}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val} className="text-white focus:bg-zinc-700">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payer name (if grouped source) */}
          {source !== 'DIRECT' && (
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Nombre del pagador (grupo)</Label>
              <Input
                {...form.register('payerName')}
                placeholder="Opcional"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
              />
            </div>
          )}

          {/* Package */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Paquete</Label>
            <Select
              value={form.watch('packageType')}
              onValueChange={(v) => form.setValue('packageType', v as FormValues['packageType'])}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {Object.entries(PACKAGE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val} className="text-white focus:bg-zinc-700">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Weight + Instructor */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Peso (kg)</Label>
              <Input
                {...form.register('weight')}
                type="number"
                placeholder="75"
                min={1}
                max={400}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Instructor</Label>
              <Select
                value={form.watch('assignedInstructorId') ?? ''}
                onValueChange={(v) => form.setValue('assignedInstructorId', v || undefined)}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="" className="text-zinc-400 focus:bg-zinc-700">
                    Sin asignar
                  </SelectItem>
                  {instructors
                    .filter((i) => i.active)
                    .map((i) => (
                      <SelectItem key={i.id} value={i.id} className="text-white focus:bg-zinc-700">
                        {i.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              className="flex-1 text-zinc-400 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-sky-600 hover:bg-sky-500 text-white"
            >
              {isPending ? 'Añadiendo...' : 'Añadir'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
