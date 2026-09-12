/**
 * __cashclose_check.mts — Standalone correctness check for cash-close-engine.ts
 *
 * Run with:  node_modules/.bin/jiti src/lib/finance/__cashclose_check.mts
 *
 * Covers the expected-vs-counted reconciliation per payment method (Sprint 2
 * treasury: daily cash close), pure — no DB.
 */

import {
  computeExpectedByMethod,
  buildCashCloseRows,
  ALL_PAYMENT_METHODS,
  CASH_CLOSE_EPSILON,
} from './cash-close-engine.js'
import type { PaymentMethod } from '../../types/domain.js'

// ─── Helpers ─────────────────────────────────────────────────

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

console.log('\n=== Cash Close Engine Validation ===\n')

// ─── ALL_PAYMENT_METHODS / epsilon sanity ─────────────────────

console.log('-- constants --')
assert(
  ALL_PAYMENT_METHODS.length === 9 &&
    ALL_PAYMENT_METHODS.includes('EFECTIVO') &&
    ALL_PAYMENT_METHODS.includes('GROUPON') &&
    // The 4 platform methods added in 20260912000001_payment_method_platforms
    // must reconcile in the till like GROUPON already did, otherwise a
    // Jumping/Freedom liquidación would silently vanish from the cierre.
    ALL_PAYMENT_METHODS.includes('SMARTBOX') &&
    ALL_PAYMENT_METHODS.includes('WONDERBOX') &&
    ALL_PAYMENT_METHODS.includes('JUMPING') &&
    ALL_PAYMENT_METHODS.includes('FREEDOM'),
  `ALL_PAYMENT_METHODS covers all 9 enum values (got ${JSON.stringify(ALL_PAYMENT_METHODS)})`
)
assert(CASH_CLOSE_EPSILON === 0.01, `CASH_CLOSE_EPSILON = 0.01 (got ${CASH_CLOSE_EPSILON})`)

/**
 * Every method at 0, spread into the fixtures below so adding a payment
 * method to the enum never again means hand-editing each expected map here.
 */
const ZERO_BY_METHOD = Object.fromEntries(
  ALL_PAYMENT_METHODS.map((m) => [m, 0])
) as Record<PaymentMethod, number>

// ─── computeExpectedByMethod — aggregation ────────────────────

console.log('\n-- computeExpectedByMethod: aggregation --')
const payments1 = [
  { amount: 100, method: 'EFECTIVO' as PaymentMethod },
  { amount: 50, method: 'EFECTIVO' as PaymentMethod },
  { amount: 200, method: 'TARJETA' as PaymentMethod },
]
const expected1 = computeExpectedByMethod(payments1)
assert(
  expected1.EFECTIVO === 150 && expected1.TARJETA === 200,
  `EFECTIVO=150, TARJETA=200 (got ${JSON.stringify(expected1)})`
)

// ─── computeExpectedByMethod — methods with no payments = 0 ───

console.log('\n-- computeExpectedByMethod: methods without payments = 0 --')
assert(
  expected1.BIZUM === 0 &&
    expected1.TRANSFERENCIA === 0 &&
    expected1.GROUPON === 0 &&
    expected1.JUMPING === 0 &&
    expected1.FREEDOM === 0,
  `BIZUM/TRANSFERENCIA/GROUPON/JUMPING/FREEDOM = 0 when no payments exist (got ${JSON.stringify(expected1)})`
)

const expectedEmpty = computeExpectedByMethod([])
assert(
  ALL_PAYMENT_METHODS.every((m) => expectedEmpty[m] === 0),
  `empty payments list -> every method 0 (got ${JSON.stringify(expectedEmpty)})`
)

// ─── computeExpectedByMethod — rounding (0.1 + 0.2) ───────────

console.log('\n-- computeExpectedByMethod: rounding --')
const roundingPayments = [
  { amount: 0.1, method: 'BIZUM' as PaymentMethod },
  { amount: 0.2, method: 'BIZUM' as PaymentMethod },
]
const roundingExpected = computeExpectedByMethod(roundingPayments)
assert(
  roundingExpected.BIZUM === 0.3,
  `0.1 + 0.2 = 0.3 exactly, no float drift (got ${roundingExpected.BIZUM})`
)

// ─── buildCashCloseRows — every method present, fixed order ──

console.log('\n-- buildCashCloseRows: every method present in fixed order --')
const { rows: allMethodRows } = buildCashCloseRows(expected1, {})
assert(
  allMethodRows.length === 9 &&
    JSON.stringify(allMethodRows.map((r) => r.method)) === JSON.stringify(ALL_PAYMENT_METHODS),
  `9 rows in ALL_PAYMENT_METHODS order (got ${JSON.stringify(allMethodRows.map((r) => r.method))})`
)

// ─── buildCashCloseRows — positive discrepancy (surplus) ──────

console.log('\n-- buildCashCloseRows: positive discrepancy (surplus) --')
const { rows: surplusRows } = buildCashCloseRows(
  { ...ZERO_BY_METHOD, EFECTIVO: 100 },
  { EFECTIVO: 110 }
)
const efectivoSurplus = surplusRows.find((r) => r.method === 'EFECTIVO')!
assert(
  efectivoSurplus.discrepancy === 10,
  `counted 110 - expected 100 = +10 surplus (got ${efectivoSurplus.discrepancy})`
)

// ─── buildCashCloseRows — negative discrepancy (shortfall) ────

console.log('\n-- buildCashCloseRows: negative discrepancy (shortfall) --')
const { rows: shortfallRows } = buildCashCloseRows(
  { ...ZERO_BY_METHOD, EFECTIVO: 100 },
  { EFECTIVO: 85 }
)
const efectivoShortfall = shortfallRows.find((r) => r.method === 'EFECTIVO')!
assert(
  efectivoShortfall.discrepancy === -15,
  `counted 85 - expected 100 = -15 shortfall (got ${efectivoShortfall.discrepancy})`
)

// ─── buildCashCloseRows — totals ───────────────────────────────

console.log('\n-- buildCashCloseRows: totals --')
const expectedMap: Record<PaymentMethod, number> = {
  ...ZERO_BY_METHOD,
  EFECTIVO: 100,
  TARJETA: 200,
  BIZUM: 50,
  TRANSFERENCIA: 0,
  GROUPON: 30,
  JUMPING: 40,
}
const countedMap = { EFECTIVO: 95, TARJETA: 200, BIZUM: 55, GROUPON: 30, JUMPING: 40 }
const { rows: totalsRows, totals } = buildCashCloseRows(expectedMap, countedMap)
assert(
  totals.expected === 420,
  `totals.expected = 100+200+50+0+30+40 = 420 (got ${totals.expected})`
)
assert(
  totals.counted === 420,
  `totals.counted = 95+200+55+0+30+40 = 420 (got ${totals.counted})`
)
assert(
  totals.discrepancy === 0,
  `totals.discrepancy = -5 (EFECTIVO) + 0 + 5 (BIZUM) + 0 + 0 = 0 (got ${totals.discrepancy})`
)
assert(
  totalsRows.every((r) => Math.abs(r.discrepancy - (r.counted - r.expected)) < CASH_CLOSE_EPSILON),
  'every row discrepancy === counted - expected'
)

// ─── buildCashCloseRows — counted defaults to 0 when not supplied ─────────

console.log('\n-- buildCashCloseRows: missing counted defaults to 0 --')
const { rows: partialRows } = buildCashCloseRows(expectedMap, { EFECTIVO: 100 })
const transferenciaRow = partialRows.find((r) => r.method === 'TRANSFERENCIA')!
assert(
  transferenciaRow.counted === 0 && transferenciaRow.expected === 0 && transferenciaRow.discrepancy === 0,
  `TRANSFERENCIA not supplied -> counted=0 (got ${JSON.stringify(transferenciaRow)})`
)
const grouponRow = partialRows.find((r) => r.method === 'GROUPON')!
assert(
  grouponRow.counted === 0 && grouponRow.expected === 30 && grouponRow.discrepancy === -30,
  `GROUPON expected 30 but not counted -> discrepancy -30 (got ${JSON.stringify(grouponRow)})`
)
const jumpingRow = partialRows.find((r) => r.method === 'JUMPING')!
assert(
  jumpingRow.counted === 0 && jumpingRow.expected === 40 && jumpingRow.discrepancy === -40,
  `JUMPING reconciles like any other method (got ${JSON.stringify(jumpingRow)})`
)

if (process.exitCode === 1) {
  console.log('\n❌ Some assertions FAILED.\n')
} else {
  console.log('\n✅ All assertions PASSED.\n')
}
