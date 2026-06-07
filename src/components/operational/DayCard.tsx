import Link from 'next/link'
import type { OperationalDaySummary } from '@/types/domain'

const WEATHER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  MARGINAL:  { label: 'Marginal',  color: '#CA8A04', bg: '#FEFCE8' },
  CANCELLED: { label: 'Cancelado', color: '#E11D48', bg: '#FFF1F2' },
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
      className={`flex flex-col h-full min-h-[96px] rounded-xl p-3 transition-all group ${
        day.weatherStatus === 'CANCELLED' ? 'opacity-50' : ''
      }`}
      style={{
        background: 'var(--card)',
        boxShadow: isToday
          ? '0 0 0 1.5px var(--primary), 0 1px 4px rgba(0,0,0,0.06)'
          : '0 0 0 1px var(--border), 0 1px 3px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={(e) => {
        if (!isToday) {
          ;(e.currentTarget as HTMLElement).style.boxShadow =
            '0 0 0 1.5px oklch(0.640 0.175 42 / 0.35), 0 4px 12px rgba(0,0,0,0.08)'
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.boxShadow = isToday
          ? '0 0 0 1.5px var(--primary), 0 1px 4px rgba(0,0,0,0.06)'
          : '0 0 0 1px var(--border), 0 1px 3px rgba(0,0,0,0.04)'
      }}
    >
      {/* Top row: day number + weather */}
      <div className="flex items-start justify-between gap-1">
        {isToday ? (
          <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[12.5px] font-bold bg-primary text-primary-foreground leading-none flex-shrink-0">
            {dayNum}
          </span>
        ) : (
          <span className="text-[14px] font-semibold text-foreground leading-none">
            {dayNum}
          </span>
        )}
        {weatherCfg && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none flex-shrink-0"
            style={{ background: weatherCfg.bg, color: weatherCfg.color }}
          >
            {weatherCfg.label}
          </span>
        )}
      </div>

      {/* Bottom: stats stacked */}
      <div className="mt-auto pt-3 flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] font-semibold text-foreground tabular-nums">{day.flightCount}</span>
          <span className="text-[11px] text-muted-foreground">{day.flightCount === 1 ? 'vuelo' : 'vuelos'}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] font-semibold text-foreground tabular-nums">{day.jumpCount}</span>
          <span className="text-[11px] text-muted-foreground">{day.jumpCount === 1 ? 'salto' : 'saltos'}</span>
        </div>
      </div>
    </Link>
  )
}
