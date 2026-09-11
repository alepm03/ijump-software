/**
 * /finanzas — Finance P&L page (Server Component)
 *
 * URL params:
 *   pt = 'day' | 'week' | 'month' | 'year'   (period type, default: 'month')
 *   pv = period value                          (default: current month YYYY-MM)
 *
 * Architecture:
 *   • This Server Component reads searchParams, calls the matching P&L action,
 *     and passes the result to the presentational <FinancePnlView />.
 *   • The <FinancePeriodSelector /> is a thin 'use client' island that handles
 *     tab switching and prev/next navigation via router.push.
 *   • The legacy /finanzas/[month] detail pages remain intact.
 */

import { format, getISOWeek, getISOWeekYear } from 'date-fns'
import { Suspense } from 'react'
import Link from 'next/link'
import { BarChart2 } from 'lucide-react'
import {
  getDayPnl,
  getWeekPnl,
  getMonthPnl,
  getYearPnl,
} from '@/lib/actions/finance'
import { FinancePnlView } from '@/components/operational/FinancePnlView'
import { FinancePeriodSelector, type PeriodType } from '@/components/operational/FinancePeriodSelector'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProfitAndLoss } from '@/types/domain'

// ─── Default period values ─────────────────────────────────────────────────────

function defaultValue(pt: PeriodType): string {
  const today = new Date()
  switch (pt) {
    case 'day':
      return format(today, 'yyyy-MM-dd')
    case 'week': {
      const w = getISOWeek(today)
      const y = getISOWeekYear(today)
      return `${y}-W${String(w).padStart(2, '0')}`
    }
    case 'month':
      return format(today, 'yyyy-MM')
    case 'year':
      return String(today.getFullYear())
  }
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchPnl(pt: PeriodType, pv: string): Promise<ProfitAndLoss> {
  switch (pt) {
    case 'day':
      return getDayPnl(pv)
    case 'week': {
      const match = /^(\d{4})-W(\d{1,2})$/.exec(pv)
      if (!match) throw new Error(`Invalid week value: ${pv}`)
      return getWeekPnl(parseInt(match[1], 10), parseInt(match[2], 10))
    }
    case 'month':
      return getMonthPnl(pv)
    case 'year':
      return getYearPnl(parseInt(pv, 10))
  }
}

// ─── Skeleton loader ───────────────────────────────────────────────────────────

function PnlSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* KPI strip skeleton */}
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
      {/* Panel skeletons */}
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
          {[0, 1, 2, 3].map((j) => (
            <div key={j} className="flex gap-4 px-4 py-3 border-b border-border">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Inner async component (enables Suspense boundary) ────────────────────────

async function PnlContent({
  periodType,
  periodValue,
}: {
  periodType: PeriodType
  periodValue: string
}) {
  const pnl = await fetchPnl(periodType, periodValue)

  return (
    <div className="p-6 max-w-4xl mx-auto w-full">
      <FinancePnlView pnl={pnl} />
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const VALID_PERIODS: PeriodType[] = ['day', 'week', 'month', 'year']

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ pt?: string; pv?: string }>
}) {
  const sp = await searchParams

  // Resolve and validate period type
  const ptRaw = sp.pt
  const periodType: PeriodType =
    ptRaw && VALID_PERIODS.includes(ptRaw as PeriodType)
      ? (ptRaw as PeriodType)
      : 'month'

  // Resolve period value (fall back to current period if missing)
  const periodValue = sp.pv ?? defaultValue(periodType)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Client island: segmented selector + prev/next + export buttons */}
      <FinancePeriodSelector periodType={periodType} periodValue={periodValue} />

      {/* Dashboard KPI shortcut */}
      <div className="bg-card border-b border-border px-7 py-2 flex items-center justify-end">
        <Link
          href="/finanzas/dashboard"
          className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-muted-foreground hover:text-primary transition-colors"
        >
          <BarChart2 size={13} />
          Dashboard KPI
        </Link>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<PnlSkeleton />}>
          <PnlContent periodType={periodType} periodValue={periodValue} />
        </Suspense>
      </div>
    </div>
  )
}
