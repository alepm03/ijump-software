'use client'

/**
 * FinanceKpiDashboard — glanceable KPI dashboard for /finanzas/dashboard.
 *
 * Renders:
 *   • Top KPI strip: ocupación, ingreso medio/salto, total saltos, % meteo
 *   • Breakdown panels: origen, producto, instructores, depósitos vs liquidación
 *
 * Design tokens: semantic only — no hardcoded hex. Mirrors FinancePnlView patterns.
 * Light mode only.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import type { FinanceKpis } from '@/types/domain'
import { cn } from '@/lib/utils'

// ─── Currency + percentage formatters ─────────────────────────────────────────

function euro(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const [i, d] = Math.abs(amount).toFixed(2).split('.')
  return `${sign}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d} €`
}

function pct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals).replace('.', ',')} %`
}

// ─── Period toggle ─────────────────────────────────────────────────────────────

type KpiPeriod = 'month' | 'year'

function PeriodToggle({ active }: { active: KpiPeriod }) {
  const router = useRouter()
  const sp = useSearchParams()

  function push(period: KpiPeriod) {
    const params = new URLSearchParams(Array.from(sp.entries()))
    params.set('kpt', period)
    // Reset period value to current when switching
    const today = new Date()
    if (period === 'month') {
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      params.set('kpv', `${today.getFullYear()}-${mm}`)
    } else {
      params.set('kpv', String(today.getFullYear()))
    }
    router.push(`/finanzas/dashboard?${params.toString()}`)
  }

  return (
    <div
      className="inline-flex bg-secondary border border-border rounded-lg p-[3px]"
      role="tablist"
      aria-label="Periodo KPI"
    >
      {(['month', 'year'] as KpiPeriod[]).map((p) => (
        <button
          key={p}
          role="tab"
          aria-selected={active === p}
          onClick={() => push(p)}
          className={cn(
            'border-none cursor-pointer font-medium text-[12.5px] px-[14px] py-[5px] rounded-md transition-all',
            active === p
              ? 'bg-card text-foreground font-semibold shadow-sm'
              : 'bg-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {p === 'month' ? 'Mes' : 'Año'}
        </button>
      ))}
    </div>
  )
}

// ─── KPI card — top strip ──────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent = false,
  positive = false,
  negative = false,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
  positive?: boolean
  negative?: boolean
}) {
  let valueClass = 'text-foreground'
  if (accent) valueClass = 'text-primary'
  else if (positive) valueClass = 'text-[oklch(0.560_0.130_158)]'
  else if (negative) valueClass = 'text-[oklch(0.560_0.200_18)]'

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </span>
      <span className={`text-[26px] leading-none font-bold tabular-nums tracking-tight ${valueClass}`}>
        {value}
      </span>
      {sub && (
        <span className="text-[12px] text-muted-foreground tabular-nums">{sub}</span>
      )}
    </div>
  )
}

// ─── Panel header ──────────────────────────────────────────────────────────────

function PanelHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <span className="text-[13.5px] font-semibold text-foreground tracking-tight">{title}</span>
      {right && (
        <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">{right}</span>
      )}
    </div>
  )
}

// ─── Bar row for mix panels ────────────────────────────────────────────────────

function BarRow({
  label,
  share,
  valuePrimary,
  valueSub,
  accent = false,
}: {
  label: string
  share: number
  valuePrimary: string
  valueSub?: string
  accent?: boolean
}) {
  return (
    <div className="grid items-center px-4 py-[10px] border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors"
      style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(100px,1fr) 100px' }}>
      <span className="text-[13px] font-medium text-foreground truncate pr-2">{label}</span>
      <div className="pr-3">
        <div className="h-[6px] rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full ${accent ? 'bg-primary' : 'bg-border'}`}
            style={{ width: `${Math.min(share, 100)}%` }}
          />
        </div>
      </div>
      <div className="text-right">
        <span className="text-[13.5px] font-semibold tabular-nums text-foreground">{valuePrimary}</span>
        {valueSub && (
          <span className="text-[11px] text-muted-foreground ml-1.5 tabular-nums">{valueSub}</span>
        )}
      </div>
    </div>
  )
}

// ─── Panel: Mix por origen ─────────────────────────────────────────────────────

function SourceMixPanel({ kpis }: { kpis: FinanceKpis }) {
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <PanelHeader
        title="Mix por origen"
        right={`${kpis.totalCompletedJumps} saltos`}
      />
      {kpis.mixBySource.length === 0 ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">Sin datos.</div>
      ) : (
        kpis.mixBySource.map((entry) => (
          <BarRow
            key={entry.label}
            label={entry.label}
            share={entry.share}
            valuePrimary={`${entry.count}`}
            valueSub={pct(entry.share, 0)}
          />
        ))
      )}
    </div>
  )
}

// ─── Panel: Mix por producto ───────────────────────────────────────────────────

function ProductMixPanel({ kpis }: { kpis: FinanceKpis }) {
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <PanelHeader
        title="Mix por producto"
        right={euro(kpis.revenueTotal)}
      />
      {kpis.mixByProduct.length === 0 ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">Sin datos.</div>
      ) : (
        kpis.mixByProduct.map((entry) => (
          <BarRow
            key={entry.label}
            label={entry.label}
            share={entry.share}
            valuePrimary={pct(entry.share, 0)}
            accent
          />
        ))
      )}
    </div>
  )
}

// ─── Panel: Productividad por instructor ───────────────────────────────────────

function InstructorPanel({ kpis }: { kpis: FinanceKpis }) {
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <PanelHeader
        title="Productividad por instructor"
        right={`${kpis.totalCompletedJumps} saltos totales`}
      />
      {kpis.instructorProductivity.length === 0 ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">Sin instructores asignados.</div>
      ) : (
        kpis.instructorProductivity.map((inst) => (
          <BarRow
            key={inst.instructorId}
            label={inst.name}
            share={inst.shareOfTotal}
            valuePrimary={`${inst.jumps} saltos`}
            valueSub={pct(inst.shareOfTotal, 0)}
          />
        ))
      )}
    </div>
  )
}

// ─── Panel: Depósitos vs liquidación ──────────────────────────────────────────

function PaymentStagesPanel({ kpis }: { kpis: FinanceKpis }) {
  const { paymentStages } = kpis
  const total = paymentStages.total

  const entries: { label: string; amount: number; accent?: boolean }[] = [
    { label: 'Depósitos (Reserva)', amount: paymentStages.reserva, accent: true },
    { label: 'Liquidación', amount: paymentStages.liquidacion },
    { label: 'Suplementos', amount: paymentStages.suplemento },
  ]

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <PanelHeader title="Depósitos vs liquidación" right={euro(total)} />
      {entries.map(({ label, amount, accent }) => {
        const share = total > 0 ? (amount / total) * 100 : 0
        return (
          <BarRow
            key={label}
            label={label}
            share={share}
            valuePrimary={euro(amount)}
            valueSub={pct(share, 0)}
            accent={accent}
          />
        )
      })}
    </div>
  )
}

// ─── Ocupación detail card ────────────────────────────────────────────────────

function OccupancyMeter({ kpis }: { kpis: FinanceKpis }) {
  const capPct = Math.min(kpis.occupancyPct, 100)
  const isGood = kpis.occupancyPct >= 80
  const barClass = isGood
    ? 'bg-[oklch(0.560_0.130_158)]'
    : kpis.occupancyPct >= 50
    ? 'bg-primary'
    : 'bg-border'

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        Ocupación de vuelo
      </span>
      <div className="flex items-end gap-3">
        <span className="text-[26px] leading-none font-bold tabular-nums tracking-tight text-foreground">
          {pct(kpis.occupancyPct)}
        </span>
        <span className="text-[13px] text-muted-foreground mb-0.5 tabular-nums">
          (cap. 2 pax/vuelo)
        </span>
      </div>
      <div>
        <div className="h-[8px] rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barClass}`}
            style={{ width: `${capPct}%` }} />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Media: {kpis.avgClientsPerFlight.toFixed(1).replace('.', ',')} clientes/vuelo
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {kpis.totalFlights} vuelos
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────

interface FinanceKpiDashboardProps {
  kpis: FinanceKpis
  activePeriod: KpiPeriod
  periodLabel: string
}

export function FinanceKpiDashboard({ kpis, activePeriod, periodLabel }: FinanceKpiDashboardProps) {
  const weatherGood = kpis.weatherCancellationPct < 10

  return (
    <div className="flex flex-col gap-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Dashboard KPI
          </div>
          <div className="text-[22px] font-bold tracking-tight text-foreground leading-[1.2] capitalize">
            {periodLabel}
          </div>
        </div>
        <PeriodToggle active={activePeriod} />
      </div>

      {/* Top KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <OccupancyMeter kpis={kpis} />

        <KpiCard
          label="Ingreso medio / salto"
          value={euro(kpis.revenuePerJump)}
          sub={`${kpis.totalCompletedJumps} saltos completados`}
          accent
        />

        <KpiCard
          label="Ingresos totales"
          value={euro(kpis.revenueTotal)}
          sub={`${kpis.totalFlights} vuelos`}
        />

        <KpiCard
          label="% Cancelación meteo"
          value={pct(kpis.weatherCancellationPct)}
          sub={`${kpis.weatherCancelledCount} de ${kpis.totalParticipants} pax`}
          positive={weatherGood}
          negative={!weatherGood && kpis.weatherCancellationPct > 0}
        />
      </div>

      {/* Breakdown panels — 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SourceMixPanel kpis={kpis} />
        <ProductMixPanel kpis={kpis} />
        <InstructorPanel kpis={kpis} />
        <PaymentStagesPanel kpis={kpis} />
      </div>

      {/* Empty state hint when no data */}
      {kpis.totalParticipants === 0 && (
        <div className="rounded-xl border border-border bg-card px-5 py-6 text-center text-[13.5px] text-muted-foreground">
          No hay datos para el periodo seleccionado.
        </div>
      )}
    </div>
  )
}
