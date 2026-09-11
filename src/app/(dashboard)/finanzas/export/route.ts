/**
 * Finance export route handler — Next.js 16 App Router
 *
 * GET /finanzas/export?period=month&value=2025-10&format=xlsx
 * GET /finanzas/export?period=day&value=2025-10-15&format=csv&table=ingresos
 * GET /finanzas/export?period=year&value=2025&format=pdf
 *
 * Query params:
 *   period  : 'day' | 'week' | 'month' | 'year'
 *   value   : period value
 *               day   → 'YYYY-MM-DD'
 *               week  → 'YYYY-WNN'  (e.g. '2025-W03')
 *               month → 'YYYY-MM'
 *               year  → 'YYYY'
 *   format  : 'xlsx' | 'csv' | 'pdf'
 *   table   : (csv only) 'ingresos' | 'gastos'  (default: 'ingresos')
 */

import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getDayPnl,
  getWeekPnl,
  getMonthPnl,
  getYearPnl,
  listExpenses,
  listExpenseCategories,
} from '@/lib/actions/finance'
import {
  buildFinancePnlWorkbook,
  workbookToBuffer,
  buildIngresosCsv,
  buildGastosCsv,
  buildFinancePnlPdf,
} from '@/lib/export'
import type { ExpenseWithCategory } from '@/lib/export'
import type { ProfitAndLoss, ExpenseCategory } from '@/types/domain'

// Ensure route is always dynamic (never statically cached)
export const dynamic = 'force-dynamic'

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireAuth(): Promise<Response | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}

// ─── Period resolver ──────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month' | 'year'

async function resolvePnl(period: Period, value: string): Promise<ProfitAndLoss> {
  switch (period) {
    case 'day':
      return getDayPnl(value)

    case 'week': {
      // value = 'YYYY-WNN'
      const match = /^(\d{4})-W(\d{1,2})$/.exec(value)
      if (!match) throw new Error(`Invalid week value: ${value} (expected YYYY-WNN)`)
      return getWeekPnl(parseInt(match[1], 10), parseInt(match[2], 10))
    }

    case 'month':
      return getMonthPnl(value)

    case 'year':
      return getYearPnl(parseInt(value, 10))

    default: {
      // TypeScript exhaustiveness — should never reach
      const _exhaustive: never = period
      throw new Error(`Unknown period: ${String(_exhaustive)}`)
    }
  }
}

/** Determine the date range (from, to) for fetching expenses */
function periodDateRange(period: Period, value: string): { from: string; to: string } {
  switch (period) {
    case 'day':
      return { from: value, to: value }

    case 'week': {
      const match = /^(\d{4})-W(\d{1,2})$/.exec(value)
      if (!match) throw new Error(`Invalid week value: ${value}`)
      const year = parseInt(match[1], 10)
      const isoWeek = parseInt(match[2], 10)
      const jan4 = new Date(Date.UTC(year, 0, 4))
      const dayOfWeek = (jan4.getUTCDay() + 6) % 7
      const monday = new Date(Date.UTC(year, 0, 4 - dayOfWeek + (isoWeek - 1) * 7))
      const sunday = new Date(monday)
      sunday.setUTCDate(monday.getUTCDate() + 6)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      return { from: fmt(monday), to: fmt(sunday) }
    }

    case 'month': {
      const year = parseInt(value.split('-')[0], 10)
      const monthNum = parseInt(value.split('-')[1], 10)
      const lastDay = new Date(year, monthNum, 0).getDate()
      return {
        from: `${value}-01`,
        to: `${value}-${String(lastDay).padStart(2, '0')}`,
      }
    }

    case 'year':
      return { from: `${value}-01-01`, to: `${value}-12-31` }
  }
}

/** Merge real expense rows with their category metadata */
async function fetchExpensesWithCategory(
  period: Period,
  value: string
): Promise<ExpenseWithCategory[]> {
  const { from, to } = periodDateRange(period, value)

  // Determine filter: for 'month' use the month filter; for others use listExpenses without month
  // listExpenses supports month ('YYYY-MM') filter. For day/week/year we fetch all and slice.
  let rawExpenses: Awaited<ReturnType<typeof listExpenses>>
  if (period === 'month') {
    rawExpenses = await listExpenses({ month: value })
  } else {
    // Fetch by date range manually — listExpenses doesn't expose a generic range filter,
    // so we use the no-filter call and filter client-side (safe: periods are short).
    const all = await listExpenses({})
    rawExpenses = all.filter((e) => e.incurredOn >= from && e.incurredOn <= to)
  }

  const categories: ExpenseCategory[] = await listExpenseCategories()
  const catById = new Map(categories.map((c) => [c.id, c]))

  return rawExpenses.map((exp) => {
    const cat = catById.get(exp.expenseCategoryId)
    return {
      ...exp,
      categoryName: cat?.name ?? exp.expenseCategoryId,
      groupType: cat?.groupType ?? 'GENERALES',
    }
  })
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<Response> {
  // 1. Auth
  const authError = await requireAuth()
  if (authError) return authError

  // 2. Parse query params
  const sp = request.nextUrl.searchParams
  const periodRaw = sp.get('period')
  const value = sp.get('value')
  const format = sp.get('format')
  const table = sp.get('table') ?? 'ingresos'

  // Validate
  const validPeriods = ['day', 'week', 'month', 'year'] as const
  const validFormats = ['xlsx', 'csv', 'pdf'] as const

  if (!periodRaw || !validPeriods.includes(periodRaw as Period)) {
    return new Response(
      JSON.stringify({ error: `Invalid period. Must be one of: ${validPeriods.join(', ')}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!value) {
    return new Response(JSON.stringify({ error: 'Missing required param: value' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!format || !validFormats.includes(format as (typeof validFormats)[number])) {
    return new Response(
      JSON.stringify({ error: `Invalid format. Must be one of: ${validFormats.join(', ')}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const period = periodRaw as Period

  try {
    // 3. Fetch data
    const pnl = await resolvePnl(period, value)

    // 4. Build file
    const safeValue = value.replace(/[^a-zA-Z0-9\-_]/g, '_')
    const baseName = `ijump_pnl_${period}_${safeValue}`

    if (format === 'xlsx') {
      const expenses = await fetchExpensesWithCategory(period, value)
      const wb = await buildFinancePnlWorkbook({ pnl, expenses })
      const bytes = await workbookToBuffer(wb)
      // Ensure plain ArrayBuffer for Blob compatibility
      const xlsxAb: ArrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

      return new Response(new Blob([xlsxAb]), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${baseName}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    if (format === 'csv') {
      let csvContent: string

      if (table === 'gastos') {
        const expenses = await fetchExpensesWithCategory(period, value)
        csvContent = buildGastosCsv(expenses, pnl)
      } else {
        csvContent = buildIngresosCsv(pnl)
      }

      const fileName = `${baseName}_${table}.csv`
      return new Response(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    if (format === 'pdf') {
      const pdfBytes = await buildFinancePnlPdf(pnl)
      // Ensure plain ArrayBuffer for Blob compatibility
      const pdfAb: ArrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer

      return new Response(new Blob([pdfAb]), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // Unreachable — TypeScript narrowing above covers all cases
    return new Response(JSON.stringify({ error: 'Unexpected format' }), { status: 400 })
  } catch (err) {
    // Log the detail server-side; return a generic message so internal
    // schema / PostgREST errors are not leaked to the client.
    console.error('[finance/export]', err)
    return new Response(JSON.stringify({ error: 'Export failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
