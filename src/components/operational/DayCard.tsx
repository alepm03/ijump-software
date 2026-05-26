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
        transition-all hover:shadow-sm
        ${isToday
          ? 'border-primary/40 bg-secondary/40 hover:border-primary/60'
          : 'border-border bg-card hover:border-border hover:bg-secondary/20'
        }
        ${day.weatherStatus === 'CANCELLED' ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-1">
        <span className={`text-sm font-semibold leading-none ${isToday ? 'text-primary' : 'text-foreground'}`}>
          {day.date.slice(8)}
        </span>
        {weatherBadge && (
          <Badge variant={weatherBadge.variant} className="text-[10px] px-1 py-0 h-4">
            {weatherBadge.label}
          </Badge>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">
          {day.flightCount} {day.flightCount === 1 ? 'vuelo' : 'vuelos'}
        </span>
        <span className="text-xs text-muted-foreground">
          {day.jumpCount} {day.jumpCount === 1 ? 'salto' : 'saltos'}
        </span>
      </div>
    </Link>
  )
}
