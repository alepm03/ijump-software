'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  getDay,
  isToday as dateFnsIsToday,
  parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { DayCard } from './DayCard'
import { NewDayDialog } from './NewDayDialog'
import { Button } from '@/components/ui/button'
import type { OperationalDaySummary } from '@/types/domain'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

interface CalendarViewProps {
  month: string
  days: OperationalDaySummary[]
}

export function CalendarView({ month, days }: CalendarViewProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | undefined>()

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
    router.push(`/?month=${format(target, 'yyyy-MM')}`)
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
            <h2 className="text-display font-semibold text-foreground ml-1">
              {monthLabel}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/')}
              className="ml-2"
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
        <div className="grid grid-cols-7 gap-1.5">
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
