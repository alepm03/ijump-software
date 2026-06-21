'use client'

/**
 * FinancePeriodSelector — client island for /finanzas.
 *
 * Manages:
 *   • Día / Semana / Mes / Año tab selector (segmented control)
 *   • Prev/Next period navigation
 *   • Export buttons (Excel / CSV / PDF) linking to /finanzas/export
 *
 * When the user changes period or navigates, it calls onPeriodChange with the
 * new {periodType, periodValue}, which the parent Server Component uses to
 * re-fetch (via a router push that updates searchParams).
 *
 * URL params:
 *   ?pt=day|week|month|year  &  pv=<value>
 */

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import {
  format,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addYears,
  subYears,
  parseISO,
  getISOWeek,
  getISOWeekYear,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PeriodType = 'day' | 'week' | 'month' | 'year'

const PERIOD_TABS: { id: PeriodType; label: string }[] = [
  { id: 'day',   label: 'Día'    },
  { id: 'week',  label: 'Semana' },
  { id: 'month', label: 'Mes'    },
  { id: 'year',  label: 'Año'    },
]

// ─── Period navigation helpers ─────────────────────────────────────────────────

function navigatePeriod(
  periodType: PeriodType,
  periodValue: string,
  delta: -1 | 1
): string {
  switch (periodType) {
    case 'day': {
      const d = parseISO(periodValue)
      const next = delta === 1 ? addDays(d, 1) : subDays(d, 1)
      return format(next, 'yyyy-MM-dd')
    }
    case 'week': {
      // value = 'YYYY-WNN'
      const match = /^(\d{4})-W(\d{1,2})$/.exec(periodValue)
      if (!match) return periodValue
      const year = parseInt(match[1], 10)
      const week = parseInt(match[2], 10)
      // Get Monday of this ISO week then add/sub 7 days
      const jan4 = new Date(Date.UTC(year, 0, 4))
      const dayOfWeek = (jan4.getUTCDay() + 6) % 7
      const monday = new Date(Date.UTC(year, 0, 4 - dayOfWeek + (week - 1) * 7))
      const refDate = delta === 1 ? addWeeks(monday, 1) : subWeeks(monday, 1)
      const newWeek = getISOWeek(refDate)
      const newYear = getISOWeekYear(refDate)
      return `${newYear}-W${String(newWeek).padStart(2, '0')}`
    }
    case 'month': {
      const d = parseISO(`${periodValue}-01`)
      const next = delta === 1 ? addMonths(d, 1) : subMonths(d, 1)
      return format(next, 'yyyy-MM')
    }
    case 'year': {
      const y = parseInt(periodValue, 10)
      const d = new Date(y, 0, 1)
      const next = delta === 1 ? addYears(d, 1) : subYears(d, 1)
      return String(next.getFullYear())
    }
  }
}

/** Human-readable label for the current period */
function periodLabel(periodType: PeriodType, periodValue: string): string {
  switch (periodType) {
    case 'day': {
      const d = parseISO(periodValue)
      return format(d, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
    }
    case 'week': {
      const match = /^(\d{4})-W(\d{1,2})$/.exec(periodValue)
      if (!match) return periodValue
      const year = parseInt(match[1], 10)
      const week = parseInt(match[2], 10)
      const jan4 = new Date(Date.UTC(year, 0, 4))
      const dayOfWeek = (jan4.getUTCDay() + 6) % 7
      const monday = new Date(Date.UTC(year, 0, 4 - dayOfWeek + (week - 1) * 7))
      const sunday = new Date(monday)
      sunday.setUTCDate(monday.getUTCDate() + 6)
      return `Semana ${week} · ${format(monday, 'd MMM', { locale: es })} – ${format(sunday, 'd MMM yyyy', { locale: es })}`
    }
    case 'month': {
      const d = parseISO(`${periodValue}-01`)
      return format(d, 'MMMM yyyy', { locale: es })
    }
    case 'year':
      return periodValue
  }
}

/** Sub-label (Día/Semana/Mes/Año) for the header */
function periodSubLabel(periodType: PeriodType): string {
  switch (periodType) {
    case 'day':   return 'Resumen financiero del día'
    case 'week':  return 'Resumen financiero de la semana'
    case 'month': return 'Resumen financiero del mes'
    case 'year':  return 'Resumen financiero del año'
  }
}

/** Build export URL for the currently selected period */
function exportUrl(periodType: PeriodType, periodValue: string, exportFormat: 'xlsx' | 'csv' | 'pdf'): string {
  const period: string = periodType
  return `/finanzas/export?period=${period}&value=${encodeURIComponent(periodValue)}&format=${exportFormat}`
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  periodType: PeriodType
  periodValue: string
}

export function FinancePeriodSelector({ periodType, periodValue }: Props) {
  const router = useRouter()

  function pushPeriod(pt: PeriodType, pv: string) {
    router.push(`/finanzas?pt=${pt}&pv=${encodeURIComponent(pv)}`)
  }

  function handleTabChange(pt: PeriodType) {
    // When switching period type, default to current calendar period
    const today = new Date()
    let defaultValue: string
    switch (pt) {
      case 'day':
        defaultValue = format(today, 'yyyy-MM-dd')
        break
      case 'week': {
        const w = getISOWeek(today)
        const y = getISOWeekYear(today)
        defaultValue = `${y}-W${String(w).padStart(2, '0')}`
        break
      }
      case 'month':
        defaultValue = format(today, 'yyyy-MM')
        break
      case 'year':
        defaultValue = String(today.getFullYear())
        break
    }
    pushPeriod(pt, defaultValue)
  }

  function handleNav(delta: -1 | 1) {
    const newValue = navigatePeriod(periodType, periodValue, delta)
    pushPeriod(periodType, newValue)
  }

  const label = periodLabel(periodType, periodValue)
  const subLabel = periodSubLabel(periodType)

  return (
    <header className="bg-card border-b border-border px-7 py-5 flex items-center justify-between gap-6">
      {/* Left: title */}
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {subLabel}
        </span>
        <span className="text-[23px] font-bold tracking-tight text-foreground leading-[1.15] capitalize truncate">
          {label}
        </span>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Period type selector (segmented control) */}
        <div
          className="inline-flex bg-secondary border border-border rounded-lg p-[3px]"
          role="tablist"
          aria-label="Periodo"
        >
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={periodType === tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'border-none cursor-pointer font-medium text-[12.5px] px-[14px] py-[5px] rounded-md transition-all',
                periodType === tab.id
                  ? 'bg-card text-foreground font-semibold shadow-sm'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Prev / Next navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleNav(-1)}
            aria-label="Periodo anterior"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => handleNav(1)}
            aria-label="Periodo siguiente"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Export group: primary button + format shortcuts */}
        <div className="inline-flex">
          {/* Primary Exportar button → xlsx by default */}
          <a
            href={exportUrl(periodType, periodValue, 'xlsx')}
            className="inline-flex items-center gap-1.5 rounded-l-lg rounded-r-none border border-primary bg-primary text-primary-foreground px-[14px] py-[8px] text-[13px] font-medium hover:bg-primary/90 transition-colors"
            download
          >
            <Download size={14} />
            Exportar
          </a>
          {/* Format shortcuts */}
          <div className="inline-flex border border-l-0 border-border rounded-r-lg overflow-hidden">
            <a
              href={exportUrl(periodType, periodValue, 'xlsx')}
              title="Exportar a Excel"
              download
              className="flex items-center px-3 py-0 text-[12px] font-semibold text-muted-foreground bg-card hover:bg-secondary hover:text-foreground transition-colors border-r border-border"
            >
              Excel
            </a>
            <a
              href={exportUrl(periodType, periodValue, 'csv')}
              title="Exportar a CSV"
              download
              className="flex items-center px-3 py-0 text-[12px] font-semibold text-muted-foreground bg-card hover:bg-secondary hover:text-foreground transition-colors border-r border-border"
            >
              CSV
            </a>
            <a
              href={exportUrl(periodType, periodValue, 'pdf')}
              title="Exportar a PDF"
              download
              className="flex items-center px-3 py-0 text-[12px] font-semibold text-muted-foreground bg-card hover:bg-secondary hover:text-foreground transition-colors"
            >
              PDF
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
