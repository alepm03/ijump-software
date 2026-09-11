'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  getDay,
  getMonth,
  getYear,
  isToday as dateFnsIsToday,
  parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ChevronDown, Plus } from 'lucide-react'
import { DayCard } from './DayCard'
import { NewDayDialog } from './NewDayDialog'
import { Button } from '@/components/ui/button'
import type { OperationalDaySummary } from '@/types/domain'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function MonthPicker({
  currentMonth,
  onSelect,
  onClose,
}: {
  currentMonth: Date
  onSelect: (month: string) => void
  onClose: () => void
}) {
  const [pickerYear, setPickerYear] = useState(getYear(currentMonth))
  const ref = useRef<HTMLDivElement>(null)
  const activeMonthIdx = getMonth(currentMonth)
  const activeYear = getYear(currentMonth)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-2 z-50 bg-card border border-border rounded-xl shadow-lg p-4 w-60"
    >
      {/* Year nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setPickerYear((y) => y - 1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-semibold text-foreground tabular-nums">{pickerYear}</span>
        <button
          onClick={() => setPickerYear((y) => y + 1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Month grid 4×3 */}
      <div className="grid grid-cols-4 gap-1">
        {MONTHS_ES.map((name, idx) => {
          const isActive = idx === activeMonthIdx && pickerYear === activeYear
          return (
            <button
              key={idx}
              onClick={() => {
                onSelect(`${pickerYear}-${String(idx + 1).padStart(2, '0')}`)
                onClose()
              }}
              className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-secondary'
              }`}
            >
              {name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface CalendarViewProps {
  month: string
  days: OperationalDaySummary[]
}

export function CalendarView({ month, days }: CalendarViewProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | undefined>()
  const [pickerOpen, setPickerOpen] = useState(false)

  const currentMonth = parseISO(`${month}-01`)
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startOffset = (getDay(monthStart) + 6) % 7
  const daysByDate = new Map(days.map((d) => [d.date, d]))

  const rawMonth = format(currentMonth, 'MMMM yyyy', { locale: es })
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1)

  function navigate(direction: 'prev' | 'next') {
    const target = direction === 'prev' ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1)
    pushMonth(`/?month=${format(target, 'yyyy-MM')}`)
  }

  // Transition so the current grid stays visible (dimmed) while the server
  // re-renders — same-segment searchParams changes never trigger loading.tsx.
  function pushMonth(href: string) {
    startTransition(() => router.push(href))
  }

  function openNewDay(date?: string) {
    setSelectedDate(date)
    setDialogOpen(true)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-8 py-7 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('prev')}
              aria-label="Mes anterior"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('next')}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </Button>

            {/* Month title — click to open picker */}
            <div className="relative">
              <button
                onClick={() => setPickerOpen((o) => !o)}
                className="flex items-center gap-1.5 ml-1 rounded-lg px-2 py-1 hover:bg-secondary transition-colors group"
              >
                <h2 className="text-display font-semibold text-foreground">
                  {monthLabel}
                </h2>
                <ChevronDown
                  size={14}
                  strokeWidth={2.5}
                  className={`text-muted-foreground transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {pickerOpen && (
                <MonthPicker
                  currentMonth={currentMonth}
                  onSelect={(m) => pushMonth(`/?month=${m}`)}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => pushMonth('/')}
              className="ml-1"
            >
              Hoy
            </Button>
          </div>

          <Button
            variant="default"
            onClick={() => openNewDay(undefined)}
          >
            <Plus size={14} />
            Nueva Jornada
          </Button>
        </div>

        {/* Calendar grid — horizontal scroll on mobile, full grid on md+ */}
        <div className="overflow-x-auto -mx-8 px-8 md:overflow-visible md:mx-0 md:px-0">
          <div className="min-w-[560px] md:min-w-0">

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="text-center text-sm font-medium text-muted-foreground py-1.5"
            >
              {wd}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div
          className={`grid grid-cols-7 gap-1.5 transition-opacity ${
            isPending ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-start-${i}`} className="min-h-[96px]" />
          ))}

          {daysInMonth.map((date) => {
            const dateStr = format(date, 'yyyy-MM-dd')
            const dayData = daysByDate.get(dateStr)
            const today = dateFnsIsToday(date)
            const dayNum = format(date, 'd')

            if (dayData) {
              return (
                <div key={dateStr}>
                  <DayCard day={dayData} isToday={today} />
                </div>
              )
            }

            // Empty day cell — Phase 3: declarative shadow instead of JS imperative style
            return (
              <button
                key={dateStr}
                onClick={() => openNewDay(dateStr)}
                className={`min-h-[96px] rounded-xl p-3 w-full flex flex-col items-start group transition-all hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                  today ? 'shadow-card-today' : 'hover:shadow-card'
                }`}
              >
                {today ? (
                  <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-2xs font-bold bg-primary text-primary-foreground leading-none">
                    {dayNum}
                  </span>
                ) : (
                  <span className="text-body font-medium text-muted-foreground/50 group-hover:text-foreground transition-colors leading-none">
                    {dayNum}
                  </span>
                )}
                <span className="mt-auto text-xs text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors">
                  + Jornada
                </span>
              </button>
            )
          })}
        </div>

          </div>{/* end min-w wrapper */}
        </div>{/* end overflow-x-auto */}

        <NewDayDialog
          open={dialogOpen}
          initialDate={selectedDate}
          onOpenChange={setDialogOpen}
        />
      </div>
    </div>
  )
}
