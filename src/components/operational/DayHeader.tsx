'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Cloud, CloudOff, Sun } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { updateOperationalDay } from '@/lib/actions/operational-day'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { OperationalDayWithDetails, WeatherStatus } from '@/types/domain'

const WEATHER_CONFIG: Record<WeatherStatus, { label: string; icon: React.ReactNode; className: string }> = {
  OK: {
    label: 'OK',
    icon: <Sun size={14} />,
    className: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50',
  },
  MARGINAL: {
    label: 'Marginal',
    icon: <Cloud size={14} />,
    className: 'text-yellow-600 border-yellow-200 hover:bg-yellow-50',
  },
  CANCELLED: {
    label: 'Cancelado',
    icon: <CloudOff size={14} />,
    className: 'text-red-500 border-red-200 hover:bg-red-50',
  },
}

interface DayHeaderProps {
  day: OperationalDayWithDetails
}

export function DayHeader({ day }: DayHeaderProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(day.notes ?? '')

  const date = parseISO(day.date)
  const weather = WEATHER_CONFIG[day.weatherStatus]

  const totalJumps = day.flights.reduce((acc, f) => acc + f.participants.length, 0)

  function handleWeatherChange(status: WeatherStatus) {
    startTransition(async () => {
      const result = await updateOperationalDay(day.id, { weatherStatus: status })
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  function handleNotesSave() {
    setEditingNotes(false)
    const trimmed = notes.trim()
    const current = day.notes ?? ''
    if (trimmed === current) return
    startTransition(async () => {
      const result = await updateOperationalDay(day.id, { notes: trimmed || null })
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="border-b border-border bg-card/80 backdrop-blur-sm px-6 py-3 sticky top-0 z-10">
      <div className="flex items-center gap-3 max-w-4xl mx-auto">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </Link>

        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground capitalize leading-tight">
            {format(date, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </h1>
          <p className="text-xs text-muted-foreground leading-tight">
            {day.flights.length} vuelos · {totalJumps} participantes
          </p>
        </div>

        {/* Weather badge */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            className={`flex items-center gap-1.5 text-xs h-7 px-2.5 bg-transparent border rounded-md transition-colors ${weather.className}`}
          >
            {weather.icon}
            {weather.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.entries(WEATHER_CONFIG) as [WeatherStatus, typeof weather][]).map(
              ([status, cfg]) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => handleWeatherChange(status)}
                  className={`flex items-center gap-2 cursor-pointer text-xs ${cfg.className}`}
                >
                  {cfg.icon}
                  {cfg.label}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notes */}
        <div className="flex-1 min-w-0 max-w-xs">
          {editingNotes ? (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleNotesSave()
                }
                if (e.key === 'Escape') {
                  setNotes(day.notes ?? '')
                  setEditingNotes(false)
                }
              }}
              placeholder="Notas del día..."
              className="text-xs h-8 min-h-0 py-1 resize-none"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="text-xs text-muted-foreground hover:text-foreground truncate block w-full text-left px-1 py-1 rounded hover:bg-secondary/60 transition-colors"
            >
              {notes || 'Añadir notas...'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
