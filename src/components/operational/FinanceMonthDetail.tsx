'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { MonthFinancialsDetail } from '@/types/domain'

interface Props {
  detail: MonthFinancialsDetail
}

function euro(amount: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)
}

function netColor(value: number): string {
  if (value > 0) return 'text-green-600'
  if (value < 0) return 'text-red-600'
  return 'text-muted-foreground'
}

const METHOD_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  BIZUM: 'Bizum',
  TRANSFERENCIA: 'Transferencia',
  GROUPON: 'Groupon',
}

export function FinanceMonthDetail({ detail }: Props) {
  const router = useRouter()
  const monthLabel = format(parseISO(`${detail.month}-01`), 'MMMM yyyy', { locale: es })

  const revenueEntries = Object.entries(detail.revenueByMethod).filter(([, v]) => v > 0)

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.push(`/finanzas?month=${detail.month}`)}
          className="mt-0.5 w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
        >
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground capitalize">{monthLabel}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {detail.dayCount} jornadas · {detail.flightCount} vuelos · {detail.jumpCount} saltos
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Ingresos totales" value={euro(detail.totalRevenue)} color="text-foreground" />
        <KpiCard label="Costes totales" value={euro(detail.totalCosts)} color="text-foreground" />
        <KpiCard
          label="Resultado neto"
          value={euro(detail.netProfit)}
          color={netColor(detail.netProfit)}
          bold
        />
      </div>

      {/* Revenue section */}
      <Section title="Ingresos" total={euro(detail.totalRevenue)}>
        {revenueEntries.length === 0 ? (
          <EmptyRow text="Sin pagos registrados este mes." />
        ) : (
          revenueEntries.map(([method, amount]) => (
            <Row
              key={method}
              label={METHOD_LABELS[method] ?? method}
              value={euro(amount)}
              pct={detail.totalRevenue > 0 ? (amount / detail.totalRevenue) * 100 : 0}
            />
          ))
        )}
      </Section>

      {/* Fixed costs section */}
      <Section title="Costes fijos" total={euro(detail.totalFuelCost + detail.totalHangarCost + detail.totalPackerCost)}>
        <Row label="Gasolina" sublabel={`${detail.flightCount} vuelos`} value={euro(detail.totalFuelCost)} />
        <Row label="Hangar" sublabel={`${detail.dayCount} jornadas`} value={euro(detail.totalHangarCost)} />
        <Row label="Plegadores" sublabel={`${detail.jumpCount} saltos`} value={euro(detail.totalPackerCost)} />
      </Section>

      {/* Instructors section */}
      {detail.instructorPayouts.length > 0 && (
        <Section title="Instructores" total={euro(detail.totalInstructorCost)}>
          {detail.instructorPayouts.map((ip) => (
            <Row
              key={ip.instructorId}
              label={ip.name}
              sublabel={`${ip.jumps} saltos × ${euro(ip.feePerJump)}`}
              value={euro(ip.total)}
            />
          ))}
        </Section>
      )}

      {/* Custom expenses section */}
      {detail.customExpenses.length > 0 && (
        <Section title="Gastos extra" total={euro(detail.totalCustomCost)}>
          {detail.customExpenses.map((e) => (
            <Row
              key={e.id}
              label={e.description || 'Gasto extra'}
              sublabel={format(parseISO(e.date), "d MMM", { locale: es })}
              value={euro(e.amount)}
            />
          ))}
        </Section>
      )}

      {/* Net result */}
      <div className="rounded-xl border-2 border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm font-bold text-foreground">Resultado del mes</span>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-0.5">Ingresos</div>
              <div className="text-sm font-semibold text-foreground">{euro(detail.totalRevenue)}</div>
            </div>
            <span className="text-muted-foreground">−</span>
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-0.5">Costes</div>
              <div className="text-sm font-semibold text-foreground">{euro(detail.totalCosts)}</div>
            </div>
            <span className="text-muted-foreground">=</span>
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-0.5">Neto</div>
              <div className={`text-xl font-bold ${netColor(detail.netProfit)}`}>
                {euro(detail.netProfit)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
  bold,
}: {
  label: string
  value: string
  color: string
  bold?: boolean
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-title leading-tight ${bold ? 'font-bold' : 'font-semibold'} ${color}`}>
        {value}
      </div>
    </div>
  )
}

function Section({
  title,
  total,
  children,
}: {
  title: string
  total: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-secondary/50 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
        <span className="text-sm font-bold text-foreground">{total}</span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  )
}

function Row({
  label,
  sublabel,
  value,
  pct,
}: {
  label: string
  sublabel?: string
  value: string
  pct?: number
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground truncate">{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {pct !== undefined && pct > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/60"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">
              {pct.toFixed(0)}%
            </span>
          </div>
        )}
        <span className="text-sm font-semibold text-foreground">{value}</span>
      </div>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-4 py-3 text-sm text-muted-foreground">{text}</div>
  )
}
