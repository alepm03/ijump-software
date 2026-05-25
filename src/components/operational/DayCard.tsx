import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { OperationalDaySummary } from '@/types/domain'

const WEATHER_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  MARGINAL: { label: 'Marginal', variant: 'secondary' },
  CANCELLED: { label: 'Cancelado', variant: 'destructive' },
}

interface DayCardProps {
  day: OperationalDaySummary
  isToday: boolean
}

export function DayCard({ day, isToday }: DayCardProps) {
  const weatherBadge = WEATHER_BADGE[day.weatherStatus]

  return (
    <Link
      href={`/${day.date}`}
      className={`
        flex flex-col gap-1 rounded-lg border p-2 h-full min-h-[80px]
        transition-colors hover:border-sky-500 hover:bg-zinc-800/60
        ${isToday ? 'border-sky-600 bg-zinc-800/40' : 'border-zinc-700 bg-zinc-900/60'}
        ${day.weatherStatus === 'CANCELLED' ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-1">
        <span className={`text-sm font-semibold leading-none ${isToday ? 'text-sky-400' : 'text-zinc-200'}`}>
          {day.date.slice(8)}
        </span>
        {weatherBadge && (
          <Badge variant={weatherBadge.variant} className="text-[10px] px-1 py-0 h-4">
            {weatherBadge.label}
          </Badge>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-0.5">
        <span className="text-xs text-zinc-400">
          {day.flightCount} {day.flightCount === 1 ? 'vuelo' : 'vuelos'}
        </span>
        <span className="text-xs text-zinc-400">
          {day.jumpCount} {day.jumpCount === 1 ? 'salto' : 'saltos'}
        </span>
      </div>
    </Link>
  )
}
