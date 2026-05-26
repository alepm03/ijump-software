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
    className: 'text-emerald-400 border-emerald-800 hover:bg-emerald-900/30',
  },
  MARGINAL: {
    label: 'Marginal',
    icon: <Cloud size={14} />,
    className: 'text-yellow-400 border-yellow-800 hover:bg-yellow-900/30',
  },
  CANCELLED: {
    label: 'Cancelado',
    icon: <CloudOff size={14} />,
    className: 'text-red-400 border-red-800 hover:bg-red-900/30',
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
    <div className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-sm px-4 py-3 sticky top-0 z-10">
      <div className="flex items-center gap-3 max-w-screen-2xl mx-auto">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200 transition-colors">
          <ArrowLeft size={18} />
        </Link>

        <div className="min-w-0">
          <h1 className="text-base font-semibold text-white capitalize leading-tight">
            {format(date, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </h1>
          <p className="text-xs text-zinc-500 leading-tight">
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
          <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700">
            {(Object.entries(WEATHER_CONFIG) as [WeatherStatus, typeof weather][]).map(
              ([status, cfg]) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => handleWeatherChange(status)}
                  className={`flex items-center gap-2 cursor-pointer ${cfg.className}`}
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
              className="text-xs h-8 min-h-0 py-1 bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 resize-none"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="text-xs text-zinc-500 hover:text-zinc-300 truncate block w-full text-left px-1 py-1 rounded hover:bg-zinc-800/60 transition-colors"
            >
              {notes || 'Añadir notas...'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
