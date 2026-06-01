'use client'

import type { FlightWithParticipants, ReservationSource, PaymentMethod } from '@/types/domain'

const CANCELLED_STATUSES = ['CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED']

const SOURCE_LABELS: Record<ReservationSource, string> = {
  DIRECT: 'Directo',
  GROUPON: 'Groupon',
  BONO: 'Bono',
  PROMO: 'Promo',
  SMARTBOX: 'Smartbox',
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  BIZUM: 'Bizum',
  TRANSFERENCIA: 'Transfer.',
  GROUPON: 'Groupon',
}

function computeSummary(flights: FlightWithParticipants[]) {
  const allParticipants = flights.flatMap((f) => f.participants)
  const active = allParticipants.filter(
    (p) => !CANCELLED_STATUSES.includes(p.operationalStatus)
  )

  const bySource: Partial<Record<ReservationSource, number>> = {}
  const byMethod: Partial<Record<PaymentMethod, number>> = {}
  let handycamCount = 0
  let externalCount = 0
  let totalRevenue = 0

  for (const p of active) {
    const source = (p.reservationGroup?.source ?? 'DIRECT') as ReservationSource
    bySource[source] = (bySource[source] ?? 0) + 1

    if (p.packageType === 'HANDYCAM' || p.packageType === 'HANDYCAM_FOTOS') handycamCount++
    if (p.packageType === 'VIDEO_EXTERNO') externalCount++

    for (const pmt of p.payments) {
      totalRevenue += pmt.amount
      byMethod[pmt.method] = (byMethod[pmt.method] ?? 0) + pmt.amount
    }
  }

  return {
    totalFlights: flights.length,
    totalJumps: active.length,
    handycamCount,
    externalCount,
    totalRevenue,
    bySource,
    byMethod,
  }
}

interface DailySummaryPanelProps {
  flights: FlightWithParticipants[]
}

export function DailySummaryPanel({ flights }: DailySummaryPanelProps) {
  const s = computeSummary(flights)

  return (
    <div className="flex-shrink-0 border-t border-border bg-card">
      <div className="flex items-center px-7 py-4 max-w-[880px] mx-auto gap-0">
        <span className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-[0.1em] mr-6 flex-shrink-0">
          Resumen
        </span>

        <div className="flex items-baseline gap-1.5 flex-shrink-0">
          <span className="text-[22px] font-extrabold text-foreground leading-none" style={{ letterSpacing: '-0.6px' }}>
            {s.totalFlights}
          </span>
          <span className="text-[13px] text-muted-foreground">vuelos</span>
        </div>

        <div className="w-px h-5 bg-border mx-6" />

        <div className="flex items-baseline gap-1.5 flex-shrink-0">
          <span className="text-[22px] font-extrabold text-foreground leading-none" style={{ letterSpacing: '-0.6px' }}>
            {s.totalJumps}
          </span>
          <span className="text-[13px] text-muted-foreground">saltos</span>
        </div>

        <div className="w-px h-5 bg-border mx-6" />

        <div className="flex items-baseline gap-1.5 flex-shrink-0">
          <span className="text-[22px] font-extrabold text-primary leading-none" style={{ letterSpacing: '-0.6px' }}>
            {s.totalRevenue.toFixed(0)}€
          </span>
          <span className="text-[13px] text-muted-foreground">ingresos</span>
        </div>

        <div className="ml-auto flex items-center gap-5 flex-wrap">
          {s.handycamCount > 0 && (
            <span className="text-[12.5px] text-muted-foreground">
              HC: <strong className="text-foreground font-bold">{s.handycamCount}</strong>
            </span>
          )}
          {s.externalCount > 0 && (
            <span className="text-[12.5px] text-muted-foreground">
              Video: <strong className="text-foreground font-bold">{s.externalCount}</strong>
            </span>
          )}
          {(Object.entries(s.bySource) as [ReservationSource, number][])
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([src, count]) => (
              <span key={src} className="text-[12.5px] text-muted-foreground">
                {SOURCE_LABELS[src]}: <strong className="text-foreground font-bold">{count}</strong>
              </span>
            ))}
          {(Object.entries(s.byMethod) as [PaymentMethod, number][])
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([method, amount]) => (
              <span key={method} className="text-[12.5px] text-muted-foreground">
                {METHOD_LABELS[method]}: <strong className="text-foreground font-bold">{amount.toFixed(0)}€</strong>
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}
