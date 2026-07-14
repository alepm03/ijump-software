'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Cloud, CloudOff, Sun, Plane, NotebookPen } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { updateOperationalDay } from '@/lib/actions/operational-day'
import { handleWeatherCancellation } from '@/lib/actions/leads'
import { computeManifestSummary } from '@/lib/manifest-summary'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState(day.notes ?? '')

  const date = parseISO(day.date)
  const weather = WEATHER_CONFIG[day.weatherStatus]

  // KPI data — computed from flights prop (already includes realtime state)
  const summary = computeManifestSummary(day.flights)

  // "martes, 26 de mayo de 2026" — capitalize only first letter
  const rawDate = format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
  const dateDisplay = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)
  const calendarHref = `/?month=${format(date, 'yyyy-MM')}`

  function handleWeatherChange(status: WeatherStatus) {
    startTransition(async () => {
      const result = await updateOperationalDay(day.id, { weatherStatus: status })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (status === 'CANCELLED') {
        const cancelResult = await handleWeatherCancellation(day.id)
        if (cancelResult.error) {
          toast.error(cancelResult.error)
          return
        }
        toast.success('Jornada cancelada por meteorología — reservas liberadas para reagendar')
      }
      router.refresh()
    })
  }

  function handleNotesSave() {
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
      <div className="flex items-center justify-between px-8 py-5 max-w-[60rem] mx-auto">

        {/* ── Left: nav + date + weather + notes (sits arriba) ── */}
        <div className="flex items-center gap-3 min-w-0 -translate-y-3">
          <Link href={calendarHref} className="text-muted-foreground hover:text-foreground transition-colors flex items-center p-1 flex-shrink-0">
            <ArrowLeft size={16} />
          </Link>

          <h1 className="text-title font-bold text-foreground leading-tight truncate min-w-0" style={{ letterSpacing: '-0.5px' }}>
            {dateDisplay}
          </h1>

          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isPending}
              className={`flex items-center gap-1.5 text-xs font-semibold h-7 px-2.5 rounded-[7px] border transition-colors flex-shrink-0 ${weather.triggerClass}`}
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

          <button
            onClick={() => setNotesOpen(true)}
            title="Notas del día"
            className={`relative flex items-center justify-center w-8 h-8 rounded-[7px] transition-colors flex-shrink-0 ${
              notes
                ? 'text-primary bg-primary/10 hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            <NotebookPen size={15} />
            {notes && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
        </div>

        {/* ── Middle: contrail del avión ── */}
        <div className="flex-1 min-w-6 mx-4 translate-y-1 flex items-center pointer-events-none select-none">
          <div
            className="flex-1 border-t border-dashed border-primary/30"
            style={{ borderTopWidth: '1.5px' }}
          />
          <Plane size={14} className="text-primary/50 ml-1.5 flex-shrink-0" />
        </div>

        {/* ── Right: KPI stats (sits abajo) ── */}
        <div className="flex items-center gap-0 flex-shrink-0 translate-y-3">
          <KpiStat value={summary.totalJumps} label="Saltos" />
          <div className="w-px h-7 bg-border mx-4 flex-shrink-0" />
          <KpiStat value={summary.totalFlights} label="Vuelos" />
          <div className="w-px h-7 bg-border mx-4 flex-shrink-0" />
          <KpiStat
            value={`${summary.totalJumps}/${summary.totalCapacity}`}
            label="Ocupación"
          />
          <div className="w-px h-7 bg-border mx-4 flex-shrink-0" />
          <KpiStat
            value={`${summary.totalRevenue.toFixed(0)}€`}
            label="Cobrado"
            accent
          />
        </div>

      </div>

      {/* ── Modal de notas ── */}
      <Dialog open={notesOpen} onOpenChange={(open) => {
        if (!open) handleNotesSave()
        setNotesOpen(open)
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <NotebookPen size={16} className="text-primary" />
              Notas del día
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setNotes(day.notes ?? ''); setNotesOpen(false) }
            }}
            placeholder="Escribe aquí las notas de la jornada..."
            className="text-sm min-h-[140px] resize-none mt-1"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Se guarda al cerrar.</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KpiStat({
  value,
  label,
  accent = false,
}: {
  value: string | number
  label: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col items-start">
      <span
        className={`text-[1.375rem] font-bold leading-none tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}
        style={{ letterSpacing: '-0.6px' }}
      >
        {value}
      </span>
      <span className="text-[0.6875rem] font-medium uppercase tracking-[0.04em] text-muted-foreground mt-1">
        {label}
      </span>
    </div>
  )
}
