/**
 * pnl-engine.ts — Pure P&L computation module.
 *
 * This module is intentionally dependency-free beyond domain types:
 *   - NO 'use server'
 *   - NO DB / Supabase imports
 *   - NO Next.js imports
 *
 * All functions here are pure (deterministic, no side effects) and
 * therefore unit-testable without any infrastructure.
 */

import type {
  ProductCategory,
  ExpenseCategory,
  ExpenseGroup,
  Expense,
  SaleChannel,
  RevenueByCategory,
  CostCategoryLine,
  CostGroup,
  ProfitAndLoss,
} from '@/types/domain'

// ─── Row shapes ──────────────────────────────────────────────
//
// These describe the nested DB-join result that callers must provide.
// They are exported so that fetch helpers in finance.ts can cast to them.

export interface ParticipantPnlRow {
  id: string
  operational_status: string
  assigned_instructor_id: string | null
  /** Reservation group join: carries the sale channel (source). Null if ungrouped. */
  reservation_group: { source: string } | null
  payments: { amount: number }[]
  participant_items: { amount: number; product_id: string; products: { category: string } | null }[]
  instructor: { id: string; name: string; fee_per_jump: number } | null
}

export interface FlightPnlRow {
  id: string
  participants: ParticipantPnlRow[]
}

export interface DayPnlRow {
  id: string
  date: string
  flights: FlightPnlRow[]
}

// ─── Constants ───────────────────────────────────────────────

/** Statuses excluded from the "completed jump" count (same rule as v1). */
export const NON_COMPLETED_STATUSES: ReadonlySet<string> = new Set([
  'CANCELLED',
  'NO_SHOW',
  'WEATHER_CANCELLED',
])

// ─── Pure helpers ────────────────────────────────────────────

/**
 * Per-participant revenue using the COALESCE rule:
 *  - If the participant has ≥1 item row → SUM(items.amount)
 *  - Otherwise                          → SUM(payments.amount)
 */
export function participantRevenue(p: ParticipantPnlRow): number {
  if (p.participant_items.length > 0) {
    return p.participant_items.reduce((s, i) => s + i.amount, 0)
  }
  return p.payments.reduce((s, pay) => s + pay.amount, 0)
}

/**
 * Accumulate revenueByCategory for a list of participants.
 * Participants WITH items  → add amounts to their product's category.
 * Participants WITHOUT items → add payments to SIN_DESGLOSE.
 */
export function accumulateRevenue(
  participants: ParticipantPnlRow[],
  acc: RevenueByCategory
): void {
  for (const p of participants) {
    if (p.participant_items.length > 0) {
      for (const item of p.participant_items) {
        // Uncategorizable item revenue (product row missing / category null)
        // falls into OTHER so the breakdown always foots to revenueTotal.
        const cat = (item.products?.category as ProductCategory | undefined) ?? 'OTHER'
        acc[cat] = (acc[cat] ?? 0) + item.amount
      }
    } else {
      const payTotal = p.payments.reduce((s, pay) => s + pay.amount, 0)
      acc.SIN_DESGLOSE = (acc.SIN_DESGLOSE ?? 0) + payTotal
    }
  }
}

/**
 * Cost for a single category over a single operational day.
 * Implements §5 of FINANCE_MODEL_V2.md.
 *
 * INSTRUCTORES is handled separately (additive: formula + manual expenses).
 */
export function categoryDayCost(params: {
  category: ExpenseCategory
  expensesForCatOnDay: Expense[]
  flightCount: number
  completedJumpCount: number
  instructorCostForDay: number
}): number {
  const { category, expensesForCatOnDay, flightCount, completedJumpCount, instructorCostForDay } = params

  if (category.code === 'INSTRUCTORES') {
    // Special: instructor formula cost (already computed) + any manual expense entries (additive)
    const manualAdjustments = expensesForCatOnDay.reduce((s, e) => s + e.amount, 0)
    return instructorCostForDay + manualAdjustments
  }

  // Override: if real expense rows exist for this day+category, they replace the formula
  if (expensesForCatOnDay.length > 0) {
    return expensesForCatOnDay.reduce((s, e) => s + e.amount, 0)
  }

  // Auto-calculated fallback
  switch (category.rateBasis) {
    case 'PER_FLIGHT':
      return (category.defaultRate ?? 0) * flightCount
    case 'PER_JUMP':
      return (category.defaultRate ?? 0) * completedJumpCount
    case 'FIXED_PER_DAY':
      return category.defaultRate ?? 0
    default:
      return 0
  }
}

/**
 * Instructor cost for a day:
 * SUM over instructors of (fee_per_jump × completed jumps by that instructor).
 */
export function computeInstructorCostForDay(participants: ParticipantPnlRow[]): number {
  const instructorJumps = new Map<string, number>()
  const instructorFee = new Map<string, number>()

  for (const p of participants) {
    if (NON_COMPLETED_STATUSES.has(p.operational_status)) continue
    if (!p.assigned_instructor_id || !p.instructor) continue
    const key = p.assigned_instructor_id
    instructorJumps.set(key, (instructorJumps.get(key) ?? 0) + 1)
    if (!instructorFee.has(key)) {
      instructorFee.set(key, p.instructor.fee_per_jump)
    }
  }

  let total = 0
  for (const [key, jumps] of instructorJumps) {
    total += jumps * (instructorFee.get(key) ?? 0)
  }
  return total
}

/** Synthetic cost line that holds the auto-computed per-channel commission. */
export const CHANNEL_COMMISSION_CODE = 'COMISION_CANAL'

/**
 * Per-channel sale commission for a list of participants.
 * commission = Σ participantRevenue(p) × pct(p.source) / 100
 *
 * The rate is resolved from sale_channels, keyed by code, mapped directly
 * from reservation_groups.source (GROUPON, SMARTBOX, DIRECT, ...). Sources
 * with no matching active channel — or a channel whose rate is still NULL
 * (pending confirmation) — contribute 0, so historical totals are unchanged
 * until a real rate is entered.
 */
export function computeChannelCommission(
  participants: ParticipantPnlRow[],
  pctByCode: Map<string, number>
): number {
  let total = 0
  for (const p of participants) {
    const code = p.reservation_group?.source
    if (!code) continue
    const pct = pctByCode.get(code)
    if (pct == null) continue
    total += participantRevenue(p) * (pct / 100)
  }
  return total
}

/**
 * Build P&L from a list of operational days plus their expenses and all expense categories.
 * periodLabel is provided by the caller (day / week / month / year string).
 */
export function buildPnl(params: {
  periodLabel: string
  days: DayPnlRow[]
  expenses: Expense[]
  categories: ExpenseCategory[]
  saleChannels?: SaleChannel[]
}): ProfitAndLoss {
  const { periodLabel, days, expenses, categories, saleChannels = [] } = params

  // Rate lookup: channel code -> commission % (only active channels with a confirmed rate).
  const pctByCode = new Map<string, number>()
  for (const ch of saleChannels) {
    if (ch.active && ch.commissionPct != null) pctByCode.set(ch.code, ch.commissionPct)
  }

  // Index expenses by (operationalDayId, categoryId) for O(1) lookup
  type ExpenseKey = `${string}:${string}` // `${dayId}:${categoryId}`
  const expenseIndex = new Map<ExpenseKey, Expense[]>()
  for (const e of expenses) {
    if (e.operationalDayId === null) continue // fixed monthly costs not tied to a day
    const key: ExpenseKey = `${e.operationalDayId}:${e.expenseCategoryId}`
    if (!expenseIndex.has(key)) expenseIndex.set(key, [])
    expenseIndex.get(key)!.push(e)
  }

  // Fixed monthly costs (operational_day_id IS NULL) grouped by category
  const fixedByCat = new Map<string, number>()
  for (const e of expenses) {
    if (e.operationalDayId !== null) continue
    fixedByCat.set(e.expenseCategoryId, (fixedByCat.get(e.expenseCategoryId) ?? 0) + e.amount)
  }

  // Accumulate revenue and per-category costs across all days
  const revByCategory: RevenueByCategory = {}
  let revenueTotal = 0
  let channelCommissionTotal = 0
  const catCostAccum = new Map<string, number>() // categoryId -> total cost

  for (const day of days) {
    const allParticipants = day.flights.flatMap((f) => f.participants)
    const completedParticipants = allParticipants.filter(
      (p) => !NON_COMPLETED_STATUSES.has(p.operational_status)
    )
    const flightCount = day.flights.length
    const completedJumpCount = completedParticipants.length

    // Revenue
    accumulateRevenue(allParticipants, revByCategory)
    revenueTotal += allParticipants.reduce((s, p) => s + participantRevenue(p), 0)

    // Per-channel sale commission (same participant base as revenue)
    channelCommissionTotal += computeChannelCommission(allParticipants, pctByCode)

    // Instructor formula cost for this day
    const instructorCostForDay = computeInstructorCostForDay(allParticipants)

    // Per-category day costs
    for (const cat of categories) {
      const key: ExpenseKey = `${day.id}:${cat.id}`
      const dayExpensesForCat = expenseIndex.get(key) ?? []
      const cost = categoryDayCost({
        category: cat,
        expensesForCatOnDay: dayExpensesForCat,
        flightCount,
        completedJumpCount,
        instructorCostForDay,
      })
      catCostAccum.set(cat.id, (catCostAccum.get(cat.id) ?? 0) + cost)
    }
  }

  // Add fixed monthly costs to category accumulators
  for (const [catId, amount] of fixedByCat) {
    catCostAccum.set(catId, (catCostAccum.get(catId) ?? 0) + amount)
  }

  // Build P&L cost groups
  const groupOrder: ExpenseGroup[] = ['COSTES_DIRECTOS', 'COMISIONES', 'PERSONAL', 'GENERALES']
  const groupMap = new Map<ExpenseGroup, CostCategoryLine[]>()
  for (const g of groupOrder) groupMap.set(g, [])

  for (const cat of categories) {
    const amount = catCostAccum.get(cat.id) ?? 0
    const line: CostCategoryLine = {
      categoryCode: cat.code,
      name: cat.name,
      group: cat.groupType,
      amount,
    }
    groupMap.get(cat.groupType)!.push(line)
  }

  // Synthetic line: auto-computed per-channel commission, inside COMISIONES.
  // Single source of truth: if the period has manual COMISION_GROUPON expense
  // rows, those win and the auto line is suppressed — mirroring the engine's
  // "manual expense rows override the formula" rule (see categoryDayCost). This
  // prevents double counting the same channel commission once a rate is set.
  const manualCommissionTotal = categories
    .filter((c) => c.code === 'COMISION_GROUPON')
    .reduce((s, c) => s + (catCostAccum.get(c.id) ?? 0), 0)

  if (channelCommissionTotal !== 0 && manualCommissionTotal === 0) {
    groupMap.get('COMISIONES')!.push({
      categoryCode: CHANNEL_COMMISSION_CODE,
      name: 'Comisiones de canal',
      group: 'COMISIONES',
      amount: channelCommissionTotal,
    })
  }

  const costGroups: CostGroup[] = groupOrder.map((group) => {
    const catLines = groupMap.get(group) ?? []
    return {
      group,
      total: catLines.reduce((s, l) => s + l.amount, 0),
      categories: catLines,
    }
  })

  const costsTotal = costGroups.reduce((s, g) => s + g.total, 0)
  const ebitda = revenueTotal - costsTotal
  const ebitdaMarginPct = revenueTotal !== 0 ? (ebitda / revenueTotal) * 100 : 0

  return {
    periodLabel,
    revenueTotal,
    revenueByCategory: revByCategory,
    costGroups,
    costsTotal,
    ebitda,
    ebitdaMarginPct,
  }
}
