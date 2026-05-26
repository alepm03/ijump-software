'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
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
  let overweightCount = 0
  let totalRevenue = 0

  for (const p of active) {
    const source = (p.reservationGroup?.source ?? 'DIRECT') as ReservationSource
    bySource[source] = (bySource[source] ?? 0) + 1

    if (p.packageType === 'HANDYCAM' || p.packageType === 'HANDYCAM_FOTOS') handycamCount++
    if (p.packageType === 'VIDEO_EXTERNO') externalCount++
    if (p.overweightFee > 0) overweightCount++

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
    overweightCount,
    totalRevenue,
    bySource,
    byMethod,
  }
}

interface DailySummaryPanelProps {
  flights: FlightWithParticipants[]
}

export function DailySummaryPanel({ flights }: DailySummaryPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const s = computeSummary(flights)

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-6 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="font-medium uppercase tracking-wider text-[10px]">Resumen del día</span>
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {!collapsed && (
        <div className="px-6 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-xs max-w-4xl mx-auto">
          {/* Totals */}
          <div>
            <p className="text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">Totales</p>
            <p className="text-foreground/80">
              <span className="font-semibold text-foreground text-base">{s.totalFlights}</span>{' '}
              vuelos
            </p>
            <p className="text-foreground/80">
              <span className="font-semibold text-foreground text-base">{s.totalJumps}</span>{' '}
              saltos
            </p>
          </div>

          {/* Media & extras */}
          <div>
            <p className="text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">Extras</p>
            <p className="text-foreground/70">HC: <span className="text-foreground font-medium">{s.handycamCount}</span></p>
            <p className="text-foreground/70">Video ext.: <span className="text-foreground font-medium">{s.externalCount}</span></p>
            <p className="text-foreground/70">Sobrepeso: <span className="text-foreground font-medium">{s.overweightCount}</span></p>
          </div>

          {/* By source */}
          <div>
            <p className="text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">Por fuente</p>
            {(Object.entries(s.bySource) as [ReservationSource, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([src, count]) => (
                <p key={src} className="text-foreground/70">
                  {SOURCE_LABELS[src]}: <span className="text-foreground font-medium">{count}</span>
                </p>
              ))}
          </div>

          {/* Revenue */}
          <div>
            <p className="text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">Ingresos</p>
            <p className="text-foreground/80 mb-1">
              <span className="font-bold text-primary text-base">
                {s.totalRevenue.toFixed(0)}€
              </span>
            </p>
            {(Object.entries(s.byMethod) as [PaymentMethod, number][])
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([method, amount]) => (
                <p key={method} className="text-foreground/70">
                  {METHOD_LABELS[method]}: <span className="text-foreground font-medium">{amount.toFixed(0)}€</span>
                </p>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
