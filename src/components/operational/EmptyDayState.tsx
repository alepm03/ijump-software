'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import { NewDayDialog } from './NewDayDialog'
import { Button } from '@/components/ui/button'

interface EmptyDayStateProps {
  date: string
}

export function EmptyDayState({ date }: EmptyDayStateProps) {
  const [open, setOpen] = useState(false)

  const parsed = parseISO(date)
  const raw = format(parsed, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
  const label = raw.charAt(0).toUpperCase() + raw.slice(1)

  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 text-center px-6">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-title font-semibold text-foreground">
          No hay jornada registrada para este día
        </p>
      </div>
      <Button variant="default" onClick={() => setOpen(true)}>
        <Plus size={14} />
        Crear jornada
      </Button>
      <NewDayDialog open={open} initialDate={date} onOpenChange={setOpen} />
    </div>
  )
}
