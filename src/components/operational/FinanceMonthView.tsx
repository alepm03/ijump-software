'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { format, addMonths, subMonths, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { MonthFinancialSummary, InstructorPayout } from '@/types/domain'

interface Props {
  month: string // YYYY-MM
  summary: MonthFinancialSummary[]
  instructorPayouts: InstructorPayout[]
}

function euro(amount: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)
}

function netColor(value: number): string {
  if (value > 0) return 'text-green-600'
  if (value < 0) return 'text-red-600'
  return 'text-muted-foreground'
}

export function FinanceMonthView({ month, summary, instructorPayouts }: Props) {
  const router = useRouter()

  const currentDate = parseISO(`${month}-01`)
  const monthLabel = format(currentDate, 'MMMM yyyy', { locale: es })

  function navigate(delta: -1 | 1) {
    const next = delta === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1)
    router.push(`/finanzas?month=${format(next, 'yyyy-MM')}`)
  }

  const totals = summary.reduce(
    (acc, row) => {
      acc.revenue += row.totalRevenue
      acc.costs += row.totalCosts
      acc.net += row.netProfit
      acc.jumps += row.jumpCount
      acc.flights += row.flightCount
      return acc
    },
    { revenue: 0, costs: 0, net: 0, jumps: 0, flights: 0 }
  )

  const totalInstructorPayout = instructorPayouts.reduce((sum, ip) => sum + ip.total, 0)

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Finanzas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Resumen económico del centro</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1.5 text-sm font-semibold text-foreground capitalize min-w-[140px] text-center">
              {monthLabel}
            </span>
            <button
              onClick={() => navigate(1)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {summary.length > 0 && (
            <button
              onClick={() => router.push(`/finanzas/${month}`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <ExternalLink size={13} />
              Ver detalle
            </button>
          )}
        </div>
      </div>

      {/* Month summary table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 bg-secondary/50 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Jornadas del mes
          </span>
          {summary.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {summary.length} jornadas · {totals.flights} vuelos · {totals.jumps} saltos
            </span>
          )}
        </div>

        {summary.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No hay jornadas registradas en este mes.
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_60px_60px_120px_120px_120px] px-4 py-2 border-b border-border bg-secondary/30">
              <span className="text-xs font-medium text-muted-foreground">Fecha</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Vuelos</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Saltos</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Ingresos</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Costes</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Neto</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {summary.map((row) => {
                const date = parseISO(row.date)
                return (
                  <div
                    key={row.date}
                    className="grid grid-cols-[1fr_60px_60px_120px_120px_120px] px-4 py-3 hover:bg-secondary/20 transition-colors cursor-pointer"
                    onClick={() => router.push(`/${row.date}`)}
                  >
                    <span className="text-sm text-foreground capitalize">
                      {format(date, "EEE d MMM", { locale: es })}
                    </span>
                    <span className="text-sm text-muted-foreground text-right">{row.flightCount}</span>
                    <span className="text-sm text-muted-foreground text-right">{row.jumpCount}</span>
                    <span className="text-sm text-foreground text-right font-medium">{euro(row.totalRevenue)}</span>
                    <span className="text-sm text-muted-foreground text-right">{euro(row.totalCosts)}</span>
                    <span className={`text-sm font-semibold text-right ${netColor(row.netProfit)}`}>
                      {euro(row.netProfit)}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Totals row */}
            <div className="grid grid-cols-[1fr_60px_60px_120px_120px_120px] px-4 py-3 border-t-2 border-border bg-secondary/40">
              <span className="text-sm font-semibold text-foreground">Total mes</span>
              <span className="text-sm font-semibold text-foreground text-right">{totals.flights}</span>
              <span className="text-sm font-semibold text-foreground text-right">{totals.jumps}</span>
              <span className="text-sm font-semibold text-foreground text-right">{euro(totals.revenue)}</span>
              <span className="text-sm font-semibold text-foreground text-right">{euro(totals.costs)}</span>
              <span className={`text-sm font-bold text-right ${netColor(totals.net)}`}>
                {euro(totals.net)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Instructor payouts */}
      {instructorPayouts.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/50 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Pagos a instructores
            </span>
            <span className="text-xs text-muted-foreground">
              Total: {euro(totalInstructorPayout)}
            </span>
          </div>

          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_100px_120px] px-4 py-2 border-b border-border bg-secondary/30">
            <span className="text-xs font-medium text-muted-foreground">Instructor</span>
            <span className="text-xs font-medium text-muted-foreground text-right">Saltos</span>
            <span className="text-xs font-medium text-muted-foreground text-right">€ / salto</span>
            <span className="text-xs font-medium text-muted-foreground text-right">Total</span>
          </div>

          <div className="divide-y divide-border">
            {instructorPayouts.map((ip) => {
              const initials = ip.name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()

              return (
                <div key={ip.instructorId} className="grid grid-cols-[1fr_80px_100px_120px] px-4 py-3 items-center">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-2xs font-semibold text-primary">{initials}</span>
                    </div>
                    <span className="text-sm text-foreground font-medium">{ip.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground text-right">{ip.jumps}</span>
                  <span className="text-sm text-muted-foreground text-right">{euro(ip.feePerJump)}</span>
                  <span className="text-sm font-semibold text-foreground text-right">{euro(ip.total)}</span>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div className="grid grid-cols-[1fr_80px_100px_120px] px-4 py-3 border-t-2 border-border bg-secondary/40">
            <span className="text-sm font-semibold text-foreground">
              Total instructores
            </span>
            <span className="text-sm font-semibold text-foreground text-right">
              {instructorPayouts.reduce((s, ip) => s + ip.jumps, 0)}
            </span>
            <span />
            <span className="text-sm font-bold text-foreground text-right">
              {euro(totalInstructorPayout)}
            </span>
          </div>
        </div>
      )}

      {instructorPayouts.length === 0 && summary.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/50 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Pagos a instructores
            </span>
          </div>
          <div className="text-center py-8 text-muted-foreground text-sm">
            No hay saltos asignados a instructores en este mes.
          </div>
        </div>
      )}
    </div>
  )
}
