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
  status: string
  is_back_to_back: boolean
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
 *
 * Non-flying participants (CANCELLED / NO_SHOW / WEATHER_CANCELLED) count
 * ONLY their payments, never their items: the sale never happened, but money
 * already collected is non-refundable per the waiver terms and stays as
 * revenue. Auto items are already cleared on cancellation
 * (clearAutoParticipantItems); this rule additionally covers manual items
 * (e.g. an on-site OW supplement) that survive that clear — without it, a
 * cancelled participant with a lingering manual item would both count
 * revenue for a jump that never happened AND hide their deposit payments
 * behind the COALESCE.
 */
export function participantRevenue(p: ParticipantPnlRow): number {
  if (!NON_COMPLETED_STATUSES.has(p.operational_status) && p.participant_items.length > 0) {
    return p.participant_items.reduce((s, i) => s + i.amount, 0)
  }
  return p.payments.reduce((s, pay) => s + pay.amount, 0)
}

/**
 * Accumulate revenueByCategory for a list of participants.
 * Participants WITH items  → add amounts to their product's category.
 * Participants WITHOUT items → add payments to SIN_DESGLOSE.
 * Non-flying participants   → payments to SIN_DESGLOSE (same rule as
 * participantRevenue, so the breakdown always foots to revenueTotal).
 */
export function accumulateRevenue(
  participants: ParticipantPnlRow[],
  acc: RevenueByCategory
): void {
  for (const p of participants) {
    if (!NON_COMPLETED_STATUSES.has(p.operational_status) && p.participant_items.length > 0) {
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
 * Implements the cost model from docs/finanzas/FINANCE_MODEL_V2.md.
 *
 * Special cases (intercept before the rateBasis switch):
 *   INSTRUCTORES    — additive: per-instructor formula + manual expense rows.
 *   CAMARA_EXTERNA  — conditional: 35 €/completed jump with external video.
 *   EQUIPOS         — conditional: 25 €/completed jump on back-to-back flights.
 *
 * For all others: manual expense rows override the formula; formula uses rateBasis.
 */
export function categoryDayCost(params: {
  category: ExpenseCategory
  expensesForCatOnDay: Expense[]
  flightCount: number
  completedJumpCount: number
  instructorCostForDay: number
  /** Completed jumps where the participant has a VIDEO_EXT (CAMERA_EXTERNAL) item */
  videoExtJumpCount: number
  /** Completed jumps on back-to-back flights (equipment rental needed) */
  backToBackJumpCount: number
}): number {
  const {
    category,
    expensesForCatOnDay,
    flightCount,
    completedJumpCount,
    instructorCostForDay,
    videoExtJumpCount,
    backToBackJumpCount,
  } = params

  if (category.code === 'INSTRUCTORES') {
    // Special: instructor formula cost (already computed) + any manual expense entries (additive)
    const manualAdjustments = expensesForCatOnDay.reduce((s, e) => s + e.amount, 0)
    return instructorCostForDay + manualAdjustments
  }

  if (category.code === 'CAMARA_EXTERNA') {
    // Special: only applies when there is external video in the day's jumps.
    // Manual expense rows override (same "real data wins" rule as other categories).
    if (expensesForCatOnDay.length > 0) return expensesForCatOnDay.reduce((s, e) => s + e.amount, 0)
    return (category.defaultRate ?? 35) * videoExtJumpCount
  }

  if (category.code === 'EQUIPOS') {
    // Special: only applies on back-to-back flights (rented equipment, 25 €/jump).
    // Manual expense rows override.
    if (expensesForCatOnDay.length > 0) return expensesForCatOnDay.reduce((s, e) => s + e.amount, 0)
    return (category.defaultRate ?? 25) * backToBackJumpCount
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
    case 'FIXED_PER_MONTH':
      // Monthly fixed costs (rent, loan, insurance, software) are NOT a per-day
      // cost. They are added once per calendar month after the day loop in
      // buildPnl (× monthsInPeriod), so they contribute 0 here.
      return 0
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

/**
 * @deprecated Revenue from platforms (Groupon, Smartbox, etc.) already arrives
 * NET — the platform retains its commission before paying iJump. Deducting a
 * commission in the P&L would be double-counting. This function is kept for
 * reference but is no longer called by buildPnl. The sale_channels table is
 * preserved as a channel registry for the reservations module.
 */
export const CHANNEL_COMMISSION_CODE = 'COMISION_CANAL'

/** @deprecated See CHANNEL_COMMISSION_CODE above. */
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
 *
 * `monthsInPeriod` controls how many times a FIXED_PER_MONTH auto-rate is
 * charged (rent, loan, insurance, software):
 *   - day / week view  → 0  (monthly overhead is not attributed to sub-monthly
 *                            slices; prorating would be arbitrary/misleading)
 *   - month view       → 1
 *   - year / YTD view  → number of distinct calendar months in the range
 * As a result, a month total is intentionally NOT the sum of its day totals:
 * the month carries fixed overhead that no individual day carries.
 * A manual fixed expense row (operational_day_id IS NULL) for the same category
 * overrides the auto-rate ("real data wins"), so there is no double counting.
 */
export function buildPnl(params: {
  periodLabel: string
  days: DayPnlRow[]
  expenses: Expense[]
  categories: ExpenseCategory[]
  monthsInPeriod: number
}): ProfitAndLoss {
  const { periodLabel, days, expenses, categories, monthsInPeriod } = params

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
  const catCostAccum = new Map<string, number>() // categoryId -> total cost

  for (const day of days) {
    const allParticipants = day.flights.flatMap((f) => f.participants)
    const completedParticipants = allParticipants.filter(
      (p) => !NON_COMPLETED_STATUSES.has(p.operational_status)
    )
    // Cancelled flights never flew: they must not charge PER_FLIGHT costs
    // (fuel, pilot). Their former occupants were moved to another flight by
    // cancelFlight (zero-orphans), so participant-based numbers are unaffected.
    const activeFlights = day.flights.filter((f) => f.status !== 'CANCELLED')
    const flightCount = activeFlights.length
    const completedJumpCount = completedParticipants.length

    // Conditional counts for special-case cost categories
    const videoExtJumpCount = completedParticipants.filter((p) =>
      p.participant_items.some((item) => item.products?.category === 'CAMERA_EXTERNAL')
    ).length

    const backToBackJumpCount = activeFlights
      .filter((f) => f.is_back_to_back)
      .flatMap((f) => f.participants)
      .filter((p) => !NON_COMPLETED_STATUSES.has(p.operational_status))
      .length

    // Revenue
    accumulateRevenue(allParticipants, revByCategory)
    revenueTotal += allParticipants.reduce((s, p) => s + participantRevenue(p), 0)

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
        videoExtJumpCount,
        backToBackJumpCount,
      })
      catCostAccum.set(cat.id, (catCostAccum.get(cat.id) ?? 0) + cost)
    }
  }

  // Add manual fixed monthly costs (expense rows with operational_day_id NULL)
  for (const [catId, amount] of fixedByCat) {
    catCostAccum.set(catId, (catCostAccum.get(catId) ?? 0) + amount)
  }

  // Add FIXED_PER_MONTH auto-rate costs once per calendar month in the period.
  // A manual fixed expense row for the same category (already in fixedByCat)
  // overrides the auto-rate — "real data wins", no double counting.
  for (const cat of categories) {
    if (cat.rateBasis !== 'FIXED_PER_MONTH') continue
    if (fixedByCat.has(cat.id)) continue
    const monthlyCost = (cat.defaultRate ?? 0) * monthsInPeriod
    if (monthlyCost === 0) continue
    catCostAccum.set(cat.id, (catCostAccum.get(cat.id) ?? 0) + monthlyCost)
  }

  // Build P&L cost groups
  const groupOrder: ExpenseGroup[] = ['COSTES_OPERATIVOS', 'GENERALES']
  const groupMap = new Map<ExpenseGroup, CostCategoryLine[]>()
  for (const g of groupOrder) groupMap.set(g, [])

  for (const cat of categories) {
    const amount = catCostAccum.get(cat.id) ?? 0
    const line: CostCategoryLine = {
      categoryCode: cat.code,
      name: cat.name,
      group: cat.groupType,
      subgroup: cat.subgroup ?? null,
      amount,
    }
    groupMap.get(cat.groupType)?.push(line)
  }

  const costGroups: CostGroup[] = groupOrder.map((group) => {
    const catLines = groupMap.get(group) ?? []

    // Pre-compute subtotals per subgroup for the UI
    const subgroupTotals: Record<string, number> = {}
    for (const line of catLines) {
      if (line.subgroup) {
        subgroupTotals[line.subgroup] = (subgroupTotals[line.subgroup] ?? 0) + line.amount
      }
    }

    return {
      group,
      total: catLines.reduce((s, l) => s + l.amount, 0),
      categories: catLines,
      subgroupTotals,
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
