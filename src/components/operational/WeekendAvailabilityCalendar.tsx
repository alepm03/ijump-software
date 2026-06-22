'use client'

/**
 * WeekendAvailabilityCalendar — month grid used by Confirm/Reschedule modals.
 *
 * Fetches getMonthAvailability(month) and colors each day by DateClass:
 *   green  = CONFIRMABLE     (clickable)
 *   amber  = TENTATIVE_ONLY  (clickable)
 *   gray   = UNAVAILABLE / NOT_OPERATING (not clickable)
 */

import { useEffect, useState, useTransition } from 'react'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMonthAvailability } from '@/lib/actions/availability'
import type { DateClass } from '@/types/domain'

const CLASS_STYLES: Record<DateClass, string> = {
  CONFIRMABLE: 'bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer font-semibold',
  TENTATIVE_ONLY: 'bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer font-semibold',
  UNAVAILABLE: 'bg-red-50/60 text-red-300 cursor-not-allowed',
  NOT_OPERATING: 'bg-transparent text-muted-foreground/30 cursor-default',
}

const SELECTABLE: DateClass[] = ['CONFIRMABLE', 'TENTATIVE_ONLY']

interface WeekendAvailabilityCalendarProps {
  initialMonth?: string // YYYY-MM
  selectedDate?: string | null
  onSelectDate: (date: string, classification: DateClass) => void
}

export function WeekendAvailabilityCalendar({
  initialMonth,
  selectedDate,
  onSelectDate,
}: WeekendAvailabilityCalendarProps) {
  const [month, setMonth] = useState(initialMonth ?? format(new Date(), 'yyyy-MM'))
  const [classByDate, setClassByDate] = useState<Record<string, DateClass>>({})
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const result = await getMonthAvailability(month)
      const map: Record<string, DateClass> = {}
      for (const r of result) map[r.date] = r.classification
      setClassByDate(map)
    })
  }, [month])

  const monthStart = startOfMonth(parseISO(`${month}-01`))
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  function shiftMonth(delta: 1 | -1) {
    const base = parseISO(`${month}-01`)
    const next = delta === 1 ? addMonths(base, 1) : subMonths(base, 1)
    setMonth(format(next, 'yyyy-MM'))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-foreground capitalize">
          {format(monthStart, 'MMMM yyyy', { locale: es })}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-2xs text-center text-muted-foreground">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const inMonth = isSameMonth(day, monthStart)
          const classification = classByDate[dateStr]
          const selectable = inMonth && classification && SELECTABLE.includes(classification)

          return (
            <button
              key={dateStr}
              type="button"
              disabled={!selectable || isPending}
              onClick={() => selectable && onSelectDate(dateStr, classification)}
              className={cn(
                'aspect-square rounded-md text-xs flex items-center justify-center transition-colors',
                !inMonth && 'opacity-30',
                inMonth && classification ? CLASS_STYLES[classification] : 'text-muted-foreground/30',
                selectedDate === dateStr && 'ring-2 ring-primary'
              )}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3 text-2xs text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" /> Libre
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Tentativa
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-200" /> Sin hueco
        </span>
      </div>
    </div>
  )
}
