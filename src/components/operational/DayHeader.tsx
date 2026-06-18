'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Cloud, CloudOff, Sun } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { updateOperationalDay } from '@/lib/actions/operational-day'
import { computeManifestSummary } from '@/lib/manifest-summary'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { OperationalDayWithDetails, WeatherStatus } from '@/types/domain'

// WEATHER_CONFIG uses token class names — no hex (Phase 1)
const WEATHER_CONFIG: Record<WeatherStatus, { label: string; icon: React.ReactNode; triggerClass: string; itemClass: string }> = {
  OK: {
    label: 'OK',
    icon: <Sun size={13} />,
    triggerClass: 'bg-weather-ok-bg border-state-success text-weather-ok',
    itemClass: 'text-weather-ok',
  },
  MARGINAL: {
    label: 'Marginal',
    icon: <Cloud size={13} />,
    triggerClass: 'bg-weather-marginal-bg border-state-warning text-weather-marginal',
    itemClass: 'text-weather-marginal',
  },
  CANCELLED: {
    label: 'Cancelado',
    icon: <CloudOff size={13} />,
    triggerClass: 'bg-weather-cancelled-bg border-state-danger text-weather-cancelled',
    itemClass: 'text-weather-cancelled',
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

  // KPI data — computed from flights prop (already includes realtime state)
  const summary = computeManifestSummary(day.flights)

  // "martes, 26 de mayo de 2026" — capitalize only first letter
  const rawDate = format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
  const dateDisplay = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)

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
    <div className="flex-shrink-0 border-b border-border bg-background">
      {/* ── Top row: nav + date + weather + notes ── */}
      <div className="flex items-center gap-3 px-7 pt-[18px] pb-3 max-w-[880px] mx-auto">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors flex items-center p-1">
          <ArrowLeft size={16} />
        </Link>

        <div>
          <h1 className="text-title font-bold text-foreground leading-tight" style={{ letterSpacing: '-0.5px' }}>
            {dateDisplay}
          </h1>
        </div>

        {/* Weather badge */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            className={`flex items-center gap-1.5 text-xs font-semibold h-7 px-2.5 rounded-[7px] border transition-colors flex-shrink-0 ml-2 ${weather.triggerClass}`}
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
                  className={`flex items-center gap-2 cursor-pointer text-xs ${cfg.itemClass}`}
                >
                  {cfg.icon}
                  {cfg.label}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notes */}
        <div className="flex-1 min-w-0 max-w-xs ml-1">
          {editingNotes ? (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNotesSave() }
                if (e.key === 'Escape') { setNotes(day.notes ?? ''); setEditingNotes(false) }
              }}
              placeholder="Notas del día..."
              className="text-xs h-8 min-h-0 py-1 resize-none"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="text-xs px-2.5 py-1 rounded-[7px] border border-dashed border-border bg-transparent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              {notes || '+ Notas del día'}
            </button>
          )}
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="flex items-center gap-2 px-7 pb-4 max-w-[880px] mx-auto">
        <KpiCard value={summary.totalJumps} label="Saltos" />
        <KpiCard value={summary.totalFlights} label="Vuelos" />
        <KpiCard
          value={`${summary.totalJumps}/${summary.totalCapacity}`}
          label="Ocupación"
        />
        <KpiCard
          value={`${summary.totalRevenue.toFixed(0)}€`}
          label="Ingresos"
          accent
        />
      </div>
    </div>
  )
}

function KpiCard({
  value,
  label,
  accent = false,
}: {
  value: string | number
  label: string
  accent?: boolean
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card px-4 py-2.5 min-w-[88px] text-right"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div
        className={`text-[22px] font-bold leading-[1.15] tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}
        style={{ letterSpacing: '-0.6px' }}
      >
        {value}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  )
}
