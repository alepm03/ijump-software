'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { NewDayDialog } from './NewDayDialog'

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
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <p className="text-[15px] font-semibold text-foreground">
          No hay jornada registrada para este día
        </p>
      </div>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors"
      >
        <span className="text-[16px] leading-none font-light">+</span>
        Crear jornada
      </button>
      <NewDayDialog open={open} initialDate={date} onOpenChange={setOpen} />
    </div>
  )
}
