/**
 * cash-close-engine.ts — Pure daily cash close (cierre de caja) computation.
 *
 * Sprint 2 treasury: expected-vs-counted reconciliation per payment method.
 * Same discipline as itemization-engine.ts / pnl-engine.ts:
 *   - NO 'use server'
 *   - NO DB / Supabase imports
 *   - NO Next.js imports
 *
 * All functions here are pure (deterministic, no side effects) and
 * therefore unit-testable without any infrastructure. The I/O (reading
 * payments, writing cash_close/cash_close_lines) lives in
 * src/lib/actions/finance.ts, which calls into this module.
 */

import type { PaymentMethod } from '@/types/domain'

/**
 * Discrepancy tolerance shared by every cash-close comparison (server-side
 * getCashCloseSummary/closeCash and any client-side "descuadre" badge). A
 * single constant avoids two surfaces disagreeing about whether a sub-cent
 * rounding remainder counts as a real discrepancy — mirrors AR_BALANCE_EPSILON
 * in itemization-engine.ts.
 */
export const CASH_CLOSE_EPSILON = 0.01

/** Every payment method the till reconciles against, in display order. */
export const ALL_PAYMENT_METHODS: PaymentMethod[] = [
  'EFECTIVO',
  'TARJETA',
  'BIZUM',
  'TRANSFERENCIA',
  'GROUPON',
]

/** Rounds to 2 decimals, avoiding float accumulation drift (e.g. 0.1 + 0.2). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export interface CashCloseRow {
  method: PaymentMethod
  expected: number
  counted: number
  /** counted − expected, rounded to 2 decimals. Positive = surplus, negative = shortfall. */
  discrepancy: number
}

export interface CashCloseTotals {
  expected: number
  counted: number
  discrepancy: number
}

/**
 * Aggregates a list of payments into a per-method expected total. EVERY
 * payment method in ALL_PAYMENT_METHODS is always present in the result
 * (0 when no payments exist for that method that day), so callers/UI never
 * need to guard against a missing key.
 */
export function computeExpectedByMethod(
  payments: { amount: number; method: PaymentMethod }[]
): Record<PaymentMethod, number> {
  const totals = {} as Record<PaymentMethod, number>
  for (const method of ALL_PAYMENT_METHODS) {
    totals[method] = 0
  }
  for (const p of payments) {
    totals[p.method] = round2(totals[p.method] + p.amount)
  }
  return totals
}

/**
 * Builds the per-method reconciliation rows + totals from an `expected` map
 * (see computeExpectedByMethod, or a frozen snapshot read back from
 * cash_close_lines) and a `counted` map (what the till physically held,
 * possibly partial/empty before the till is actually counted).
 *
 * Every method in ALL_PAYMENT_METHODS is always present in `rows`, in the
 * same fixed display order, with counted defaulting to 0 if not supplied.
 */
export function buildCashCloseRows(
  expected: Record<PaymentMethod, number>,
  counted: Partial<Record<PaymentMethod, number>>
): { rows: CashCloseRow[]; totals: CashCloseTotals } {
  const rows: CashCloseRow[] = ALL_PAYMENT_METHODS.map((method) => {
    const exp = round2(expected[method] ?? 0)
    const cnt = round2(counted[method] ?? 0)
    return {
      method,
      expected: exp,
      counted: cnt,
      discrepancy: round2(cnt - exp),
    }
  })

  const totals: CashCloseTotals = {
    expected: round2(rows.reduce((s, r) => s + r.expected, 0)),
    counted: round2(rows.reduce((s, r) => s + r.counted, 0)),
    discrepancy: round2(rows.reduce((s, r) => s + r.discrepancy, 0)),
  }

  return { rows, totals }
}
