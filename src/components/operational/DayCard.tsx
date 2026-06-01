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
        flex flex-col gap-1 rounded-[9px] p-2.5 h-full min-h-[82px]
        transition-all hover:shadow-md
        ${day.weatherStatus === 'CANCELLED' ? 'opacity-60' : ''}
      `}
      style={{
        background: 'var(--card)',
        borderWidth: isToday ? '1px' : '1px',
        borderStyle: 'solid',
        borderColor: isToday ? 'oklch(0.882 0.068 50)' : 'var(--border)',
        borderTopWidth: '2px',
        borderTopColor: isToday ? 'var(--primary)' : 'oklch(0.882 0.068 50)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className="text-sm font-bold leading-none"
          style={{ color: isToday ? 'var(--primary)' : 'var(--foreground)' }}
        >
          {day.date.slice(8)}
        </span>
        {weatherBadge && (
          <Badge variant={weatherBadge.variant} className="text-[10px] px-1 py-0 h-4">
            {weatherBadge.label}
          </Badge>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-0.5">
        <span className="text-[11px] text-muted-foreground">
          {day.flightCount} {day.flightCount === 1 ? 'vuelo' : 'vuelos'}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {day.jumpCount} {day.jumpCount === 1 ? 'salto' : 'saltos'}
        </span>
      </div>
    </Link>
  )
}
