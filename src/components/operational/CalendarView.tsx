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

  function navigate(direction: 'prev' | 'next') {
    const target = direction === 'prev'
      ? subMonths(currentMonth, 1)
      : addMonths(currentMonth, 1)
    router.push(`/?month=${format(target, 'yyyy-MM')}`)
  }

  function openNewDay(date?: string) {
    setSelectedDate(date)
    setDialogOpen(true)
  }

  return (
    // h-full + overflow-y-auto so calendar scrolls inside the fixed-height main area
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('prev')}
              className="px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground text-[15px] bg-transparent transition-colors"
            >
              ‹
            </button>
            <h2 className="text-xl font-bold text-foreground capitalize min-w-[148px] text-center" style={{ letterSpacing: '-0.5px' }}>
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h2>
            <button
              onClick={() => navigate('next')}
              className="px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground text-[15px] bg-transparent transition-colors"
            >
              ›
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs bg-transparent transition-colors ml-1"
            >
              Hoy
            </button>
          </div>
          <Button
            onClick={() => openNewDay(undefined)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            style={{ letterSpacing: '-0.2px' }}
          >
            + Nueva Jornada
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-center text-[11px] font-semibold text-muted-foreground py-1 uppercase tracking-wider">
              {wd}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-start-${i}`} className="min-h-[82px]" />
          ))}

          {daysInMonth.map((date) => {
            const dateStr = format(date, 'yyyy-MM-dd')
            const dayData = daysByDate.get(dateStr)
            const today = dateFnsIsToday(date)

            if (dayData) {
              return (
                <div key={dateStr} className="min-h-[82px]">
                  <DayCard day={dayData} isToday={today} />
                </div>
              )
            }

            return (
              <button
                key={dateStr}
                onClick={() => openNewDay(dateStr)}
                className={`
                  min-h-[82px] rounded-[9px] text-left p-2.5 w-full flex flex-col
                  transition-all group
                  ${today
                    ? 'border-2 border-t-[2px] border-primary/40 bg-transparent'
                    : 'border border-border bg-transparent hover:bg-secondary/50 hover:border-primary/30'
                  }
                `}
              >
                <span className={`text-sm font-medium leading-none transition-colors ${today ? 'text-primary font-bold' : 'text-muted-foreground'} group-hover:text-primary`}>
                  {format(date, 'd')}
                </span>
              </button>
            )
          })}
        </div>

        <NewDayDialog
          open={dialogOpen}
          initialDate={selectedDate}
          onOpenChange={setDialogOpen}
        />
      </div>
    </div>
  )
}
