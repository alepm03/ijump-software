/**
 * /finanzas/dashboard — Finance KPI Dashboard (Server Component)
 *
 * URL params:
 *   kpt = 'month' | 'year'  (KPI period type, default: 'month')
 *   kpv = period value      (default: current month YYYY-MM or current year)
 *
 * Architecture:
 *   • Server Component reads searchParams, calls getMonthKpis or getYearKpis,
 *     passes the result to the client <FinanceKpiDashboard /> component.
 *   • The period toggle inside FinanceKpiDashboard pushes new URL params
 *     via router.push (client-side navigation re-triggers this server component).
 */

import { Suspense } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseISO } from 'date-fns'
import { getMonthKpis, getYearKpis } from '@/lib/actions/finance'
import { FinanceKpiDashboard } from '@/components/operational/FinanceKpiDashboard'
import { Skeleton } from '@/components/ui/skeleton'
import type { FinanceKpis } from '@/types/domain'

// ─── Types ─────────────────────────────────────────────────────────────────────

type KpiPeriodType = 'month' | 'year'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function defaultKpiValue(kpt: KpiPeriodType): string {
  const today = new Date()
  if (kpt === 'month') {
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    return `${today.getFullYear()}-${mm}`
  }
  return String(today.getFullYear())
}

function humanLabel(kpt: KpiPeriodType, kpv: string): string {
  if (kpt === 'month') {
    try {
      return format(parseISO(`${kpv}-01`), 'MMMM yyyy', { locale: es })
    } catch {
      return kpv
    }
  }
  return kpv // year: "2026"
}

async function fetchKpis(kpt: KpiPeriodType, kpv: string): Promise<FinanceKpis> {
  if (kpt === 'month') {
    return getMonthKpis(kpv)
  }
  return getYearKpis(parseInt(kpv, 10))
}

// ─── Skeleton loader ────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      {/* Top strip */}
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-2 w-full rounded-full mt-1" />
          </div>
        ))}
      </div>
      {/* Breakdown panels */}
      <div className="grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-[6px] flex-1 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Inner async component ─────────────────────────────────────────────────────

async function KpiContent({
  kpt,
  kpv,
}: {
  kpt: KpiPeriodType
  kpv: string
}) {
  const kpis = await fetchKpis(kpt, kpv)
  const label = humanLabel(kpt, kpv)

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <FinanceKpiDashboard kpis={kpis} activePeriod={kpt} periodLabel={label} />
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const VALID_KPT: KpiPeriodType[] = ['month', 'year']

export default async function FinanzasDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams

  const kptRaw = typeof sp.kpt === 'string' ? sp.kpt : undefined
  const kpt: KpiPeriodType =
    kptRaw && VALID_KPT.includes(kptRaw as KpiPeriodType)
      ? (kptRaw as KpiPeriodType)
      : 'month'

  const kpv =
    typeof sp.kpv === 'string' && sp.kpv.length > 0
      ? sp.kpv
      : defaultKpiValue(kpt)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<KpiSkeleton />}>
          <KpiContent kpt={kpt} kpv={kpv} />
        </Suspense>
      </div>
    </div>
  )
}
