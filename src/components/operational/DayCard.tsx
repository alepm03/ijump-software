import Link from 'next/link'
import type { OperationalDaySummary } from '@/types/domain'

// WEATHER_CONFIG uses token class names — no hex (Phase 1)
const WEATHER_CONFIG: Record<string, { label: string; className: string }> = {
  MARGINAL:  { label: 'Marginal',  className: 'bg-weather-marginal-bg text-weather-marginal' },
  CANCELLED: { label: 'Cancelado', className: 'bg-weather-cancelled-bg text-weather-cancelled' },
}

interface DayCardProps {
  day: OperationalDaySummary
  isToday: boolean
}

export function DayCard({ day, isToday }: DayCardProps) {
  const weatherCfg = WEATHER_CONFIG[day.weatherStatus]
  const dayNum = day.date.slice(8)

  return (
    <Link
      href={`/${day.date}`}
      className={`flex flex-col h-full min-h-[96px] rounded-xl p-3 bg-card transition-all group ${
        day.weatherStatus === 'CANCELLED' ? 'opacity-50' : ''
      } ${
        isToday
          ? 'shadow-card-today'
          : 'shadow-card hover:shadow-card-hover'
      }`}
    >
      {/* Top row: day number + weather */}
      <div className="flex items-start justify-between gap-1">
        {isToday ? (
          <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-2xs font-bold bg-primary text-primary-foreground leading-none flex-shrink-0">
            {dayNum}
          </span>
        ) : (
          <span className="text-body font-semibold text-foreground leading-none">
            {dayNum}
          </span>
        )}
        {weatherCfg && (
          <span
            className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full leading-none flex-shrink-0 ${weatherCfg.className}`}
          >
            {weatherCfg.label}
          </span>
        )}
      </div>

      {/* Bottom: stats stacked */}
      <div className="mt-auto pt-3 flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-semibold text-foreground tabular-nums">{day.flightCount}</span>
          <span className="text-xs text-muted-foreground">{day.flightCount === 1 ? 'vuelo' : 'vuelos'}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-semibold text-foreground tabular-nums">{day.jumpCount}</span>
          <span className="text-xs text-muted-foreground">{day.jumpCount === 1 ? 'salto' : 'saltos'}</span>
        </div>
      </div>
    </Link>
  )
}
