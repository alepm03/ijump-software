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
 *   COSTES_DIRECTOS total 230  (COMBUSTIBLE 200 + PLEGADOS 30)
 *   GENERALES total        80  (TASAS_AERODROMO 50 + manual GENERALES 30)
 *   PERSONAL total        150  (INSTRUCTORES: I1×2jumps×50 + I2×1jump×50)
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
  SaleChannel,
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
  reservation_group: null,
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
  reservation_group: null,
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
  reservation_group: null,
  instructor: I1,
  payments: [{ amount: 200 }],
  participant_items: [],
}

// P4 — NO_SHOW, no items → should NOT count as a jump; revenue still counted (60)
const P4: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000004',
  operational_status: 'NO_SHOW',
  assigned_instructor_id: I1_ID,
  reservation_group: null,
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
  { id: CAT_COMBUSTIBLE_ID,      code: 'COMBUSTIBLE',        name: 'Combustible',        groupType: 'COSTES_DIRECTOS', defaultRate: 100, rateBasis: 'PER_FLIGHT',    sortOrder: 1, active: true },
  { id: CAT_PLEGADOS_ID,         code: 'PLEGADOS',           name: 'Plegados',           groupType: 'COSTES_DIRECTOS', defaultRate: 10,  rateBasis: 'PER_JUMP',      sortOrder: 2, active: true },
  { id: CAT_TASAS_AERODROMO_ID,  code: 'TASAS_AERODROMO',   name: 'Tasas Aeródromo',   groupType: 'GENERALES',       defaultRate: 50,  rateBasis: 'FIXED_PER_DAY', sortOrder: 3, active: true },
  { id: CAT_INSTRUCTORES_ID,     code: 'INSTRUCTORES',       name: 'Instructores',       groupType: 'PERSONAL',       defaultRate: null, rateBasis: null,            sortOrder: 4, active: true },
  { id: CAT_VUELOS_ID,           code: 'VUELOS',             name: 'Vuelos',             groupType: 'COSTES_DIRECTOS', defaultRate: null, rateBasis: null,            sortOrder: 5, active: true },
  { id: CAT_EQUIPOS_ID,          code: 'EQUIPOS',            name: 'Equipos',            groupType: 'GENERALES',       defaultRate: null, rateBasis: null,            sortOrder: 6, active: true },
  { id: CAT_EDICION_ID,          code: 'EDICION',            name: 'Edición',            groupType: 'COSTES_DIRECTOS', defaultRate: null, rateBasis: null,            sortOrder: 7, active: true },
  { id: CAT_COMISION_GROUPON_ID, code: 'COMISION_GROUPON',  name: 'Comisión Groupon',  groupType: 'COMISIONES',      defaultRate: null, rateBasis: null,            sortOrder: 8, active: true },
  { id: CAT_GENERALES_ID,        code: 'GENERALES',          name: 'Generales',          groupType: 'GENERALES',      defaultRate: null, rateBasis: null,            sortOrder: 9, active: true },
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

console.log('\n-- Cost groups (new taxonomy) --')
const directos = pnl.costGroups.find(g => g.group === 'COSTES_DIRECTOS')
const comisiones = pnl.costGroups.find(g => g.group === 'COMISIONES')
const personal = pnl.costGroups.find(g => g.group === 'PERSONAL')
const generales = pnl.costGroups.find(g => g.group === 'GENERALES')

// COSTES_DIRECTOS = COMBUSTIBLE 200 + PLEGADOS 30 + VUELOS 0 + EDICION 0
assert(directos !== undefined && directos.total === 230,
  `COSTES_DIRECTOS total === 230 (got ${directos?.total})`)
// COMISIONES = COMISION_GROUPON 0 (no manual rows, no auto rate yet)
assert(comisiones !== undefined && comisiones.total === 0,
  `COMISIONES total === 0 (got ${comisiones?.total})`)
assert(personal !== undefined && personal.total === 150,
  `PERSONAL total === 150 (got ${personal?.total})`)
// GENERALES = TASAS_AERODROMO 50 + EQUIPOS 0 + GENERALES 30
assert(generales !== undefined && generales.total === 80,
  `GENERALES total === 80 (got ${generales?.total})`)

// Verify category breakdown lands in the right groups
const combustible = directos?.categories.find(c => c.categoryCode === 'COMBUSTIBLE')
const tasas = generales?.categories.find(c => c.categoryCode === 'TASAS_AERODROMO')
const plegados = directos?.categories.find(c => c.categoryCode === 'PLEGADOS')

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
            reservation_group: null,
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

// ─── Invariant: reclassification must not change costsTotal or ebitda ───────────
// Moving categories between groups is purely presentational. Dump every category
// into a single group and assert the bottom line is identical to the base run.
console.log('\n-- Invariant: group reclassification preserves costsTotal & ebitda --')
const reclassified: ExpenseCategory[] = categories.map((c) => ({ ...c, groupType: 'COSTES_DIRECTOS' }))
const reclassifiedPnl = buildPnl({ periodLabel: '2026-10-04', days, expenses, categories: reclassified })
assert(reclassifiedPnl.costsTotal === pnl.costsTotal,
  `reclassified costsTotal (${reclassifiedPnl.costsTotal}) === base (${pnl.costsTotal})`)
assert(reclassifiedPnl.ebitda === pnl.ebitda,
  `reclassified ebitda (${reclassifiedPnl.ebitda}) === base (${pnl.ebitda})`)

// ─── Channel commission: per-participant sale × provider rate, into COMISIONES ──
console.log('\n-- Channel commission (per-provider rate) --')
const GROUPON_CHANNEL: SaleChannel = {
  id: 'ch-groupon', code: 'GROUPON', name: 'Groupon', channelKind: 'PLATFORM',
  commissionPct: 10, active: true, notes: null, sortOrder: 1, createdAt: '', updatedAt: '',
}
const grouponDay: DayPnlRow[] = [
  {
    id: 'comm-day',
    date: '2026-10-06',
    flights: [
      {
        id: 'comm-flight',
        participants: [
          {
            id: 'comm-p1',
            operational_status: 'COMPLETED',
            assigned_instructor_id: null,
            reservation_group: { source: 'GROUPON' }, // 215 × 10% = 21.5
            instructor: null,
            payments: [],
            participant_items: [
              { amount: 215, product_id: 'prod-t', products: { category: 'TANDEM_BASE' } },
            ],
          },
          {
            id: 'comm-p2',
            operational_status: 'COMPLETED',
            assigned_instructor_id: null,
            reservation_group: { source: 'BONO' }, // no matching provider → 0
            instructor: null,
            payments: [],
            participant_items: [
              { amount: 100, product_id: 'prod-t', products: { category: 'TANDEM_BASE' } },
            ],
          },
        ],
      },
    ],
  },
]

// (b) With a confirmed rate: commission = 215 × 10% = 21.5, lands in COMISIONES.
const commPnl = buildPnl({
  periodLabel: 'comm', days: grouponDay, expenses: [], categories: [],
  saleChannels: [GROUPON_CHANNEL],
})
const commGroup = commPnl.costGroups.find(g => g.group === 'COMISIONES')
const commLine = commGroup?.categories.find(c => c.categoryCode === 'COMISION_CANAL')
assert(commPnl.revenueTotal === 315,
  `commission: revenueTotal === 315 (got ${commPnl.revenueTotal})`)
assert(approxEqual(commLine?.amount ?? -1, 21.5),
  `commission line === 21.5 (215×10%, BONO excluded; got ${commLine?.amount})`)
assert(approxEqual(commGroup?.total ?? -1, 21.5),
  `COMISIONES total === 21.5 (got ${commGroup?.total})`)
assert(approxEqual(commPnl.costsTotal, 21.5),
  `commission: costsTotal === 21.5 (got ${commPnl.costsTotal})`)
assert(approxEqual(commPnl.ebitda, 293.5),
  `commission: ebitda === 293.5 (315 − 21.5; got ${commPnl.ebitda})`)

// (c) With NULL rate (pending): commission = 0, totals unchanged, no synthetic line.
const PENDING_CHANNEL: SaleChannel = { ...GROUPON_CHANNEL, commissionPct: null }
const pendingPnl = buildPnl({
  periodLabel: 'pending', days: grouponDay, expenses: [], categories: [],
  saleChannels: [PENDING_CHANNEL],
})
const pendingComm = pendingPnl.costGroups.find(g => g.group === 'COMISIONES')
assert(pendingComm?.total === 0,
  `pending rate: COMISIONES total === 0 (got ${pendingComm?.total})`)
assert(pendingComm?.categories.length === 0,
  `pending rate: no synthetic commission line (got ${pendingComm?.categories.length})`)
assert(pendingPnl.costsTotal === 0 && pendingPnl.ebitda === 315,
  `pending rate: costsTotal 0 / ebitda 315 (got ${pendingPnl.costsTotal} / ${pendingPnl.ebitda})`)

// (d) Overlap guard: a manual COMISION_GROUPON expense row in the period must
// SUPPRESS the auto channel line (manual wins → single source of truth, no
// double count). Same GROUPON day + confirmed rate, plus a manual 40 € row.
console.log('\n-- Overlap guard: manual COMISION_GROUPON suppresses auto line --')
const COMMISSION_CAT: ExpenseCategory = {
  id: 'cat-comision', code: 'COMISION_GROUPON', name: 'Comisión Groupon',
  groupType: 'COMISIONES', defaultRate: null, rateBasis: null, sortOrder: 8, active: true,
}
const manualCommissionExpense: Expense[] = [
  {
    id: 'exp-comm', expenseCategoryId: 'cat-comision', operationalDayId: 'comm-day',
    incurredOn: '2026-10-06', description: 'Comisión manual', supplier: null, sociedad: null,
    amount: 40, vatRate: null, createdAt: '', updatedAt: '',
  },
]
const overlapPnl = buildPnl({
  periodLabel: 'overlap', days: grouponDay, expenses: manualCommissionExpense,
  categories: [COMMISSION_CAT], saleChannels: [GROUPON_CHANNEL],
})
const overlapGroup = overlapPnl.costGroups.find(g => g.group === 'COMISIONES')
const overlapAuto = overlapGroup?.categories.find(c => c.categoryCode === 'COMISION_CANAL')
assert(overlapAuto === undefined,
  `overlap: auto COMISION_CANAL line suppressed (got ${overlapAuto?.amount})`)
assert(overlapGroup?.total === 40,
  `overlap: COMISIONES total === 40 (manual only, no double count; got ${overlapGroup?.total})`)

console.log('\n-- Raw output --')
console.log(JSON.stringify(pnl, null, 2))

if (process.exitCode === 1) {
  console.log('\n❌ Some assertions FAILED.\n')
} else {
  console.log('\n✅ All assertions PASSED.\n')
}
