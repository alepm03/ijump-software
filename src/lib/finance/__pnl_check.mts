/**
 * __pnl_check.mts — Standalone correctness check for pnl-engine.ts
 *
 * Run with:  node_modules/.bin/jiti src/lib/finance/__pnl_check.mts
 *
 * Mirrors the synthetic scenario in 02_roadmap/finance_v2_validation.sql:
 *   Revenue 925  |  Costs 460  |  EBITDA 465  (margin ~50.27%)
 *
 * Scenario:
 *   - Operational day: 2026-10-04 with 2 flights
 *   - P1 COMPLETED: items [TANDEM_BASE 215, HANDYCAM 60] instructor I1 (fee 50)
 *   - P2 COMPLETED: items [TANDEM_BASE 215, VIDEO_EXT→CAMERA_EXTERNAL 175] instructor I2 (fee 50)
 *   - P3 COMPLETED: no items, payments 200, instructor I1
 *   - P4 NO_SHOW:   no items, payments 60,  instructor I1 (must NOT count as jump)
 *   - Expense: GENERALES 30 (day-bound)
 *   - Category rates:
 *       COMBUSTIBLE   default_rate 100 PER_FLIGHT
 *       PLEGADOS      default_rate 10  PER_JUMP
 *       TASAS_AERODROMO default_rate 50 FIXED_PER_DAY
 *       INSTRUCTORES  special (computed from formula + manual)
 *       VUELOS/EQUIPOS/EDICION/COMISION_GROUPON  manual 0
 *       GENERALES     manual (override by expense row)
 *
 * Expected:
 *   revenueTotal          925
 *   TANDEM_BASE           430
 *   CAMERA_HANDYCAM        60
 *   CAMERA_EXTERNAL       175
 *   SIN_DESGLOSE          260  (P3 200 + P4 60 — both lack items)
 *   MATERIA_PRIMA total   280  (COMBUSTIBLE 200 + TASAS_AERODROMO 50 + PLEGADOS 30)
 *   PERSONAL total        150  (INSTRUCTORES: I1×2jumps×50 + I2×1jump×50)
 *   GENERALES total        30
 *   costsTotal            460
 *   ebitda                465
 *   ebitdaMarginPct       ≈50.27
 */

// Use relative import — no @/ alias needed here
import {
  buildPnl,
  type DayPnlRow,
  type ParticipantPnlRow,
} from './pnl-engine.js'

import type {
  Expense,
  ExpenseCategory,
  ProfitAndLoss,
} from '../../types/domain.js'

// ─── Helpers ─────────────────────────────────────────────────

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

function approxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) < tolerance
}

// ─── Fixtures ────────────────────────────────────────────────

// IDs
const DAY_ID = 'aaaa0000-0000-0000-0000-000000000001'
const FLIGHT1_ID = 'cccc0000-0000-0000-0000-000000000001'
const FLIGHT2_ID = 'cccc0000-0000-0000-0000-000000000002'
const I1_ID = 'bbbb0000-0000-0000-0000-000000000001'
const I2_ID = 'bbbb0000-0000-0000-0000-000000000002'

// Category IDs (arbitrary UUIDs for the test)
const CAT_COMBUSTIBLE_ID      = 'cat-0001'
const CAT_PLEGADOS_ID         = 'cat-0002'
const CAT_TASAS_AERODROMO_ID  = 'cat-0003'
const CAT_INSTRUCTORES_ID     = 'cat-0004'
const CAT_VUELOS_ID           = 'cat-0005'
const CAT_EQUIPOS_ID          = 'cat-0006'
const CAT_EDICION_ID          = 'cat-0007'
const CAT_COMISION_GROUPON_ID = 'cat-0008'
const CAT_GENERALES_ID        = 'cat-0009'

// Instructors
const I1 = { id: I1_ID, name: 'Inst Uno',  fee_per_jump: 50 }
const I2 = { id: I2_ID, name: 'Inst Dos', fee_per_jump: 50 }

// Participants
const P1: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000001',
  operational_status: 'COMPLETED',
  assigned_instructor_id: I1_ID,
  instructor: I1,
  payments: [
    { amount: 60 },
    { amount: 215 },
  ],
  participant_items: [
    { amount: 215, product_id: 'prod-tandem', products: { category: 'TANDEM_BASE' } },
    { amount: 60,  product_id: 'prod-hc',     products: { category: 'CAMERA_HANDYCAM' } },
  ],
}

const P2: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000002',
  operational_status: 'COMPLETED',
  assigned_instructor_id: I2_ID,
  instructor: I2,
  payments: [
    { amount: 60 },
    { amount: 330 },
  ],
  participant_items: [
    { amount: 215, product_id: 'prod-tandem',  products: { category: 'TANDEM_BASE' } },
    { amount: 175, product_id: 'prod-videoext', products: { category: 'CAMERA_EXTERNAL' } },
  ],
}

// P3 — COMPLETED, no items → revenue from payments (200)
const P3: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000003',
  operational_status: 'COMPLETED',
  assigned_instructor_id: I1_ID,
  instructor: I1,
  payments: [{ amount: 200 }],
  participant_items: [],
}

// P4 — NO_SHOW, no items → should NOT count as a jump; revenue still counted (60)
const P4: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000004',
  operational_status: 'NO_SHOW',
  assigned_instructor_id: I1_ID,
  instructor: I1,
  payments: [{ amount: 60 }],
  participant_items: [],
}

const days: DayPnlRow[] = [
  {
    id: DAY_ID,
    date: '2026-10-04',
    flights: [
      { id: FLIGHT1_ID, participants: [P1, P2] },
      { id: FLIGHT2_ID, participants: [P3, P4] },
    ],
  },
]

// One day-bound expense: GENERALES = 30
const expenses: Expense[] = [
  {
    id: 'exp-0001',
    expenseCategoryId: CAT_GENERALES_ID,
    operationalDayId: DAY_ID,
    incurredOn: '2026-10-04',
    description: 'Varios',
    supplier: null,
    sociedad: null,
    amount: 30,
    vatRate: null,
    createdAt: '2026-10-04T12:00:00Z',
    updatedAt: '2026-10-04T12:00:00Z',
  },
]

// Expense categories (matching DB seed)
const categories: ExpenseCategory[] = [
  { id: CAT_COMBUSTIBLE_ID,      code: 'COMBUSTIBLE',        name: 'Combustible',        groupType: 'MATERIA_PRIMA', defaultRate: 100, rateBasis: 'PER_FLIGHT',    sortOrder: 1, active: true },
  { id: CAT_PLEGADOS_ID,         code: 'PLEGADOS',           name: 'Plegados',           groupType: 'MATERIA_PRIMA', defaultRate: 10,  rateBasis: 'PER_JUMP',      sortOrder: 2, active: true },
  { id: CAT_TASAS_AERODROMO_ID,  code: 'TASAS_AERODROMO',   name: 'Tasas Aeródromo',   groupType: 'MATERIA_PRIMA', defaultRate: 50,  rateBasis: 'FIXED_PER_DAY', sortOrder: 3, active: true },
  { id: CAT_INSTRUCTORES_ID,     code: 'INSTRUCTORES',       name: 'Instructores',       groupType: 'PERSONAL',     defaultRate: null, rateBasis: null,            sortOrder: 4, active: true },
  { id: CAT_VUELOS_ID,           code: 'VUELOS',             name: 'Vuelos',             groupType: 'MATERIA_PRIMA', defaultRate: null, rateBasis: null,            sortOrder: 5, active: true },
  { id: CAT_EQUIPOS_ID,          code: 'EQUIPOS',            name: 'Equipos',            groupType: 'MATERIA_PRIMA', defaultRate: null, rateBasis: null,            sortOrder: 6, active: true },
  { id: CAT_EDICION_ID,          code: 'EDICION',            name: 'Edición',            groupType: 'MATERIA_PRIMA', defaultRate: null, rateBasis: null,            sortOrder: 7, active: true },
  { id: CAT_COMISION_GROUPON_ID, code: 'COMISION_GROUPON',  name: 'Comisión Groupon',  groupType: 'MATERIA_PRIMA', defaultRate: null, rateBasis: null,            sortOrder: 8, active: true },
  { id: CAT_GENERALES_ID,        code: 'GENERALES',          name: 'Generales',          groupType: 'GENERALES',    defaultRate: null, rateBasis: null,            sortOrder: 9, active: true },
]

// ─── Run the engine ──────────────────────────────────────────

const pnl: ProfitAndLoss = buildPnl({
  periodLabel: '2026-10-04',
  days,
  expenses,
  categories,
})

// ─── Assertions ──────────────────────────────────────────────

console.log('\n=== P&L Engine Validation (finance_v2_validation.sql scenario) ===\n')

console.log('-- Revenue --')
assert(pnl.revenueTotal === 925,
  `revenueTotal === 925 (got ${pnl.revenueTotal})`)
assert(pnl.revenueByCategory.TANDEM_BASE === 430,
  `revenueByCategory.TANDEM_BASE === 430 (got ${pnl.revenueByCategory.TANDEM_BASE})`)
assert(pnl.revenueByCategory.CAMERA_HANDYCAM === 60,
  `revenueByCategory.CAMERA_HANDYCAM === 60 (got ${pnl.revenueByCategory.CAMERA_HANDYCAM})`)
assert(pnl.revenueByCategory.CAMERA_EXTERNAL === 175,
  `revenueByCategory.CAMERA_EXTERNAL === 175 (got ${pnl.revenueByCategory.CAMERA_EXTERNAL})`)
assert(pnl.revenueByCategory.SIN_DESGLOSE === 260,
  `revenueByCategory.SIN_DESGLOSE === 260 (got ${pnl.revenueByCategory.SIN_DESGLOSE})`)

console.log('\n-- Cost groups --')
const mp = pnl.costGroups.find(g => g.group === 'MATERIA_PRIMA')
const personal = pnl.costGroups.find(g => g.group === 'PERSONAL')
const generales = pnl.costGroups.find(g => g.group === 'GENERALES')

assert(mp !== undefined && mp.total === 280,
  `MATERIA_PRIMA total === 280 (got ${mp?.total})`)
assert(personal !== undefined && personal.total === 150,
  `PERSONAL total === 150 (got ${personal?.total})`)
assert(generales !== undefined && generales.total === 30,
  `GENERALES total === 30 (got ${generales?.total})`)

// Verify MATERIA_PRIMA breakdown
const combustible = mp?.categories.find(c => c.categoryCode === 'COMBUSTIBLE')
const tasas = mp?.categories.find(c => c.categoryCode === 'TASAS_AERODROMO')
const plegados = mp?.categories.find(c => c.categoryCode === 'PLEGADOS')

assert(combustible?.amount === 200,
  `COMBUSTIBLE === 200 (2 flights × 100; got ${combustible?.amount})`)
assert(tasas?.amount === 50,
  `TASAS_AERODROMO === 50 (FIXED_PER_DAY; got ${tasas?.amount})`)
assert(plegados?.amount === 30,
  `PLEGADOS === 30 (3 completed jumps × 10; got ${plegados?.amount})`)

console.log('\n-- Totals --')
assert(pnl.costsTotal === 460,
  `costsTotal === 460 (got ${pnl.costsTotal})`)
assert(pnl.ebitda === 465,
  `ebitda === 465 (got ${pnl.ebitda})`)
assert(approxEqual(pnl.ebitdaMarginPct, 50.27),
  `ebitdaMarginPct ≈ 50.27 (got ${pnl.ebitdaMarginPct.toFixed(4)})`)

// ─── Regression: null product category must not vanish from the breakdown ───
console.log('\n-- Regression: null product category (invariant) --')
const nullCatDay: DayPnlRow[] = [
  {
    id: 'reg-day',
    date: '2026-10-05',
    flights: [
      {
        id: 'reg-flight',
        participants: [
          {
            id: 'reg-p',
            operational_status: 'COMPLETED',
            assigned_instructor_id: null,
            instructor: null,
            payments: [],
            participant_items: [
              { amount: 215, product_id: 'prod-x', products: null },
            ],
          },
        ],
      },
    ],
  },
]
const regPnl = buildPnl({ periodLabel: 'reg', days: nullCatDay, expenses: [], categories })
const regSum = Object.values(regPnl.revenueByCategory).reduce((s, v) => s + (v ?? 0), 0)
assert(regPnl.revenueTotal === 215,
  `null-cat: revenueTotal === 215 (got ${regPnl.revenueTotal})`)
assert(regSum === regPnl.revenueTotal,
  `null-cat: Σ revenueByCategory (${regSum}) === revenueTotal (${regPnl.revenueTotal})`)
assert(regPnl.revenueByCategory.OTHER === 215,
  `null-cat: OTHER bucket === 215 (got ${regPnl.revenueByCategory.OTHER})`)

console.log('\n-- Raw output --')
console.log(JSON.stringify(pnl, null, 2))

if (process.exitCode === 1) {
  console.log('\n❌ Some assertions FAILED.\n')
} else {
  console.log('\n✅ All assertions PASSED.\n')
}
