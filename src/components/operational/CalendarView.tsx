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
  month: string // 'yyyy-MM'
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

  // Monday-first offset: Sun(0)→6, Mon(1)→0, ..., Sat(6)→5
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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('prev')}
            className="text-zinc-400 hover:text-white"
          >
            ‹
          </Button>
          <h2 className="text-xl font-semibold text-white capitalize min-w-[180px] text-center">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('next')}
            className="text-zinc-400 hover:text-white"
          >
            ›
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/')}
            className="text-zinc-500 hover:text-white text-xs ml-1"
          >
            Hoy
          </Button>
        </div>
        <Button
          onClick={() => openNewDay(undefined)}
          className="bg-sky-600 hover:bg-sky-500 text-white"
        >
          + Nueva Jornada
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-xs font-medium text-zinc-500 py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells before first day */}
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-start-${i}`} className="min-h-[80px]" />
        ))}

        {/* Day cells */}
        {daysInMonth.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd')
          const dayData = daysByDate.get(dateStr)
          const today = dateFnsIsToday(date)

          if (dayData) {
            return (
              <div key={dateStr} className="min-h-[80px]">
                <DayCard day={dayData} isToday={today} />
              </div>
            )
          }

          return (
            <button
              key={dateStr}
              onClick={() => openNewDay(dateStr)}
              className={`
                min-h-[80px] rounded-lg border text-left p-2 w-full
                transition-colors group
                ${today
                  ? 'border-sky-800 bg-zinc-900/40'
                  : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40'
                }
              `}
            >
              <span className={`text-sm font-medium leading-none ${today ? 'text-sky-400' : 'text-zinc-500'}`}>
                {format(date, 'd')}
              </span>
              <span className="block mt-1 text-xs text-zinc-700 group-hover:text-zinc-500 transition-colors">
                +
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
  )
}
