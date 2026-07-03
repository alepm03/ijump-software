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
  ALL_PAYMENT_METHODS.length === 5 &&
    ALL_PAYMENT_METHODS.includes('EFECTIVO') &&
    ALL_PAYMENT_METHODS.includes('GROUPON'),
  `ALL_PAYMENT_METHODS covers all 5 enum values (got ${JSON.stringify(ALL_PAYMENT_METHODS)})`
)
assert(CASH_CLOSE_EPSILON === 0.01, `CASH_CLOSE_EPSILON = 0.01 (got ${CASH_CLOSE_EPSILON})`)

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
  expected1.BIZUM === 0 && expected1.TRANSFERENCIA === 0 && expected1.GROUPON === 0,
  `BIZUM/TRANSFERENCIA/GROUPON = 0 when no payments exist (got ${JSON.stringify(expected1)})`
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
  allMethodRows.length === 5 &&
    JSON.stringify(allMethodRows.map((r) => r.method)) === JSON.stringify(ALL_PAYMENT_METHODS),
  `5 rows in ALL_PAYMENT_METHODS order (got ${JSON.stringify(allMethodRows.map((r) => r.method))})`
)

// ─── buildCashCloseRows — positive discrepancy (surplus) ──────

console.log('\n-- buildCashCloseRows: positive discrepancy (surplus) --')
const { rows: surplusRows } = buildCashCloseRows(
  { EFECTIVO: 100, TARJETA: 0, BIZUM: 0, TRANSFERENCIA: 0, GROUPON: 0 },
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
  { EFECTIVO: 100, TARJETA: 0, BIZUM: 0, TRANSFERENCIA: 0, GROUPON: 0 },
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
  EFECTIVO: 100,
  TARJETA: 200,
  BIZUM: 50,
  TRANSFERENCIA: 0,
  GROUPON: 30,
}
const countedMap = { EFECTIVO: 95, TARJETA: 200, BIZUM: 55, GROUPON: 30 }
const { rows: totalsRows, totals } = buildCashCloseRows(expectedMap, countedMap)
assert(
  totals.expected === 380,
  `totals.expected = 100+200+50+0+30 = 380 (got ${totals.expected})`
)
assert(
  totals.counted === 380,
  `totals.counted = 95+200+55+0+30 = 380 (got ${totals.counted})`
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

if (process.exitCode === 1) {
  console.log('\n❌ Some assertions FAILED.\n')
} else {
  console.log('\n✅ All assertions PASSED.\n')
}
