/**
 * __pnl_check.mts — Standalone correctness check for pnl-engine.ts
 *
 * Run with:  node_modules/.bin/jiti src/lib/finance/__pnl_check.mts
 *
 * Scenario (Raúl real-data rates, June 2026):
 *   3 flights on the same operational day:
 *     Flight 1 — normal (is_back_to_back: false), 2 participants
 *       P1 COMPLETED: TANDEM_BASE 215 + VIDEO_EXT(CAMERA_EXTERNAL) 175, instructor I1 (30€/jump)
 *       P2 COMPLETED: TANDEM_BASE 215 + HANDYCAM 60, instructor I2 (30€/jump)
 *     Flight 2 — back-to-back (is_back_to_back: true), 2 participants
 *       P3 COMPLETED: TANDEM_BASE 215, instructor I1 (30€/jump)
 *       P4 NO_SHOW:   payments 60, instructor I1 (must NOT count as a jump)
 *     Flight 3 — normal (is_back_to_back: false), 1 participant
 *       P5 COMPLETED: no items, payments 200 (SIN_DESGLOSE), instructor I2 (30€/jump)
 *
 *   Category rates (confirmed by Raúl):
 *     INSTRUCTORES  30€/jump  (special: per-instructor × jumps)
 *     PLEGADOS      15€/jump  PER_JUMP
 *     PILOTO        15€/flight PER_FLIGHT
 *     CAMARA_EXTERNA 35€/videoExtJump (special: only participants with VIDEO_EXT)
 *     COMBUSTIBLE  100€/flight PER_FLIGHT  (test value)
 *     EQUIPOS       25€/B2B completed jump (special: only on B2B flights)
 *     EDICION       10€/jump  PER_JUMP
 *     VUELOS        null/null  → 0
 *     TASAS_AERODROMO 100€/month FIXED_PER_MONTH (test value, prod=1040), monthsInPeriod=1
 *
 * Expected revenue:
 *   P1: 390  P2: 275  P3: 215  (items)
 *   P4: 60   P5: 200            (payments → SIN_DESGLOSE)
 *   revenueTotal = 1140
 *   TANDEM_BASE = 645, CAMERA_EXTERNAL = 175, CAMERA_HANDYCAM = 60, SIN_DESGLOSE = 260
 *
 * Expected costs (flightCount=3, completedJumps=4, videoExt=1, B2B completed=1):
 *   INSTRUCTORES:   I1 × 2 jumps (P1+P3) × 30 = 60; I2 × 2 jumps (P2+P5) × 30 = 60 → 120
 *   PLEGADOS:       4 × 15 = 60
 *   PILOTO:         3 × 15 = 45
 *   CAMARA_EXTERNA: 1 × 35 = 35   (only P1 has VIDEO_EXT)
 *   COMBUSTIBLE:    3 × 100 = 300
 *   EQUIPOS:        1 × 25 = 25   (only P3 on B2B flight, P4 is NO_SHOW)
 *   EDICION:        4 × 10 = 40
 *   VUELOS:         0
 *   TASAS_AERODROMO: 100 (FIXED_PER_DAY)
 *
 *   COSTES_OPERATIVOS:
 *     PERSONAL subgroup:  120 + 60 + 45 + 35 = 260
 *     MATERIAL subgroup:  300 + 25 + 40 + 0  = 365
 *     total = 625
 *   GENERALES: 100 (TASAS_AERODROMO FIXED_PER_MONTH × monthsInPeriod 1)
 *   costsTotal = 725
 *   ebitda = 1140 - 725 = 415
 *   ebitdaMarginPct ≈ 36.40%
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

const DAY_ID    = 'aaaa0000-0000-0000-0000-000000000001'
const F1_ID     = 'cccc0000-0000-0000-0000-000000000001'  // normal
const F2_ID     = 'cccc0000-0000-0000-0000-000000000002'  // back-to-back
const F3_ID     = 'cccc0000-0000-0000-0000-000000000003'  // normal
const I1_ID     = 'bbbb0000-0000-0000-0000-000000000001'
const I2_ID     = 'bbbb0000-0000-0000-0000-000000000002'

const I1 = { id: I1_ID, name: 'Instructor Uno', fee_per_jump: 30 }
const I2 = { id: I2_ID, name: 'Instructor Dos', fee_per_jump: 30 }

// P1: COMPLETED, TANDEM_BASE + VIDEO_EXT → activates CAMARA_EXTERNA
const P1: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000001',
  operational_status: 'COMPLETED',
  assigned_instructor_id: I1_ID,
  reservation_group: null,
  instructor: I1,
  payments: [{ amount: 215 }, { amount: 175 }],
  participant_items: [
    { amount: 215, product_id: 'prod-tandem', products: { category: 'TANDEM_BASE' } },
    { amount: 175, product_id: 'prod-videoext', products: { category: 'CAMERA_EXTERNAL' } },
  ],
}

// P2: COMPLETED, TANDEM_BASE + HANDYCAM
const P2: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000002',
  operational_status: 'COMPLETED',
  assigned_instructor_id: I2_ID,
  reservation_group: null,
  instructor: I2,
  payments: [{ amount: 215 }, { amount: 60 }],
  participant_items: [
    { amount: 215, product_id: 'prod-tandem',  products: { category: 'TANDEM_BASE' } },
    { amount: 60,  product_id: 'prod-hc',      products: { category: 'CAMERA_HANDYCAM' } },
  ],
}

// P3: COMPLETED, on B2B flight → activates EQUIPOS cost
const P3: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000003',
  operational_status: 'COMPLETED',
  assigned_instructor_id: I1_ID,
  reservation_group: null,
  instructor: I1,
  payments: [{ amount: 215 }],
  participant_items: [
    { amount: 215, product_id: 'prod-tandem', products: { category: 'TANDEM_BASE' } },
  ],
}

// P4: NO_SHOW, on B2B flight → must NOT count as B2B completed jump
const P4: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000004',
  operational_status: 'NO_SHOW',
  assigned_instructor_id: I1_ID,
  reservation_group: null,
  instructor: I1,
  payments: [{ amount: 60 }],
  participant_items: [],
}

// P5: COMPLETED, no items → revenue from payments (SIN_DESGLOSE)
const P5: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000005',
  operational_status: 'COMPLETED',
  assigned_instructor_id: I2_ID,
  reservation_group: null,
  instructor: I2,
  payments: [{ amount: 200 }],
  participant_items: [],
}

const days: DayPnlRow[] = [
  {
    id: DAY_ID,
    date: '2026-10-04',
    flights: [
      { id: F1_ID, status: 'COMPLETED', is_back_to_back: false, participants: [P1, P2] },
      { id: F2_ID, status: 'COMPLETED', is_back_to_back: true,  participants: [P3, P4] },
      { id: F3_ID, status: 'COMPLETED', is_back_to_back: false, participants: [P5] },
    ],
  },
]

const expenses: Expense[] = []  // no manual overrides in base scenario

// Category IDs
const CAT_INSTRUCTORES_ID  = 'cat-0001'
const CAT_PLEGADOS_ID      = 'cat-0002'
const CAT_PILOTO_ID        = 'cat-0003'
const CAT_CAMARA_EXT_ID    = 'cat-0004'
const CAT_COMBUSTIBLE_ID   = 'cat-0005'
const CAT_EQUIPOS_ID       = 'cat-0006'
const CAT_EDICION_ID       = 'cat-0007'
const CAT_VUELOS_ID        = 'cat-0008'
const CAT_TASAS_ID         = 'cat-0009'

const categories: ExpenseCategory[] = [
  // COSTES_OPERATIVOS / PERSONAL
  { id: CAT_INSTRUCTORES_ID, code: 'INSTRUCTORES',  name: 'Instructores',           groupType: 'COSTES_OPERATIVOS', subgroup: 'PERSONAL', defaultRate: 30,   rateBasis: null,           sortOrder: 1,  active: true },
  { id: CAT_PLEGADOS_ID,     code: 'PLEGADOS',      name: 'Plegados',               groupType: 'COSTES_OPERATIVOS', subgroup: 'PERSONAL', defaultRate: 15,   rateBasis: 'PER_JUMP',     sortOrder: 2,  active: true },
  { id: CAT_PILOTO_ID,       code: 'PILOTO',        name: 'Piloto',                 groupType: 'COSTES_OPERATIVOS', subgroup: 'PERSONAL', defaultRate: 15,   rateBasis: 'PER_FLIGHT',   sortOrder: 3,  active: true },
  { id: CAT_CAMARA_EXT_ID,   code: 'CAMARA_EXTERNA',name: 'Monitor cámara externa', groupType: 'COSTES_OPERATIVOS', subgroup: 'PERSONAL', defaultRate: 35,   rateBasis: 'PER_JUMP',     sortOrder: 4,  active: true },
  // COSTES_OPERATIVOS / MATERIAL
  { id: CAT_COMBUSTIBLE_ID,  code: 'COMBUSTIBLE',   name: 'Combustible',            groupType: 'COSTES_OPERATIVOS', subgroup: 'MATERIAL', defaultRate: 100,  rateBasis: 'PER_FLIGHT',   sortOrder: 5,  active: true },
  { id: CAT_EQUIPOS_ID,      code: 'EQUIPOS',       name: 'Equipos',                groupType: 'COSTES_OPERATIVOS', subgroup: 'MATERIAL', defaultRate: 25,   rateBasis: 'PER_JUMP',     sortOrder: 6,  active: true },
  { id: CAT_EDICION_ID,      code: 'EDICION',       name: 'Edición',                groupType: 'COSTES_OPERATIVOS', subgroup: 'MATERIAL', defaultRate: 10,   rateBasis: 'PER_JUMP',     sortOrder: 7,  active: true },
  { id: CAT_VUELOS_ID,       code: 'VUELOS',        name: 'Vuelos (avión)',          groupType: 'COSTES_OPERATIVOS', subgroup: 'MATERIAL', defaultRate: null, rateBasis: null,           sortOrder: 8,  active: true },
  // GENERALES — monthly fixed cost (rent bundle). FIXED_PER_MONTH: charged once
  // per calendar month (× monthsInPeriod), NOT per operational day.
  { id: CAT_TASAS_ID,        code: 'TASAS_AERODROMO', name: 'Tasas aeródromo',      groupType: 'GENERALES',         subgroup: null,       defaultRate: 100,  rateBasis: 'FIXED_PER_MONTH', sortOrder: 9, active: true },
]

// ─── Run the engine ──────────────────────────────────────────

// Base scenario as a single-month view (monthsInPeriod = 1): TASAS_AERODROMO
// FIXED_PER_MONTH at rate 100 → GENERALES = 100, same as the old per-day model
// charged once. Expected numbers below are unchanged.
const pnl: ProfitAndLoss = buildPnl({
  periodLabel: '2026-10',
  days,
  expenses,
  categories,
  monthsInPeriod: 1,
})

// ─── Assertions ──────────────────────────────────────────────

console.log('\n=== P&L Engine Validation (Raúl real-data rates) ===\n')

console.log('-- Revenue --')
assert(pnl.revenueTotal === 1140,
  `revenueTotal === 1140 (got ${pnl.revenueTotal})`)
assert(pnl.revenueByCategory.TANDEM_BASE === 645,
  `TANDEM_BASE === 645 (P1:215 + P2:215 + P3:215; got ${pnl.revenueByCategory.TANDEM_BASE})`)
assert(pnl.revenueByCategory.CAMERA_EXTERNAL === 175,
  `CAMERA_EXTERNAL === 175 (P1 only; got ${pnl.revenueByCategory.CAMERA_EXTERNAL})`)
assert(pnl.revenueByCategory.CAMERA_HANDYCAM === 60,
  `CAMERA_HANDYCAM === 60 (P2 only; got ${pnl.revenueByCategory.CAMERA_HANDYCAM})`)
assert(pnl.revenueByCategory.SIN_DESGLOSE === 260,
  `SIN_DESGLOSE === 260 (P4:60 + P5:200; got ${pnl.revenueByCategory.SIN_DESGLOSE})`)

console.log('\n-- Cost groups (two groups only: COSTES_OPERATIVOS, GENERALES) --')
assert(pnl.costGroups.length === 2,
  `costGroups.length === 2 (got ${pnl.costGroups.length})`)
assert(pnl.costGroups.every(g => g.group === 'COSTES_OPERATIVOS' || g.group === 'GENERALES'),
  `all groups are COSTES_OPERATIVOS or GENERALES`)

const operativos = pnl.costGroups.find(g => g.group === 'COSTES_OPERATIVOS')
const generales  = pnl.costGroups.find(g => g.group === 'GENERALES')

assert(operativos !== undefined, 'COSTES_OPERATIVOS group exists')
assert(generales  !== undefined, 'GENERALES group exists')

console.log('\n-- COSTES_OPERATIVOS individual categories --')
const instructores  = operativos?.categories.find(c => c.categoryCode === 'INSTRUCTORES')
const plegados      = operativos?.categories.find(c => c.categoryCode === 'PLEGADOS')
const piloto        = operativos?.categories.find(c => c.categoryCode === 'PILOTO')
const camaraExterna = operativos?.categories.find(c => c.categoryCode === 'CAMARA_EXTERNA')
const combustible   = operativos?.categories.find(c => c.categoryCode === 'COMBUSTIBLE')
const equipos       = operativos?.categories.find(c => c.categoryCode === 'EQUIPOS')
const edicion       = operativos?.categories.find(c => c.categoryCode === 'EDICION')
const vuelos        = operativos?.categories.find(c => c.categoryCode === 'VUELOS')

// INSTRUCTORES: I1 × 2 completed (P1+P3) × 30 = 60; I2 × 2 completed (P2+P5) × 30 = 60 → 120
assert(instructores?.amount === 120,
  `INSTRUCTORES === 120 (I1×2×30 + I2×2×30; got ${instructores?.amount})`)
// PLEGADOS: 4 completed jumps × 15 = 60
assert(plegados?.amount === 60,
  `PLEGADOS === 60 (4 jumps × 15; got ${plegados?.amount})`)
// PILOTO: 3 flights × 15 = 45
assert(piloto?.amount === 45,
  `PILOTO === 45 (3 flights × 15; got ${piloto?.amount})`)
// CAMARA_EXTERNA: 1 VIDEO_EXT jump (P1) × 35 = 35
assert(camaraExterna?.amount === 35,
  `CAMARA_EXTERNA === 35 (1 videoExtJump × 35; got ${camaraExterna?.amount})`)
// COMBUSTIBLE: 3 flights × 100 = 300
assert(combustible?.amount === 300,
  `COMBUSTIBLE === 300 (3 flights × 100; got ${combustible?.amount})`)
// EQUIPOS: 1 completed B2B jump (P3 on F2; P4 is NO_SHOW) × 25 = 25
assert(equipos?.amount === 25,
  `EQUIPOS === 25 (1 B2B completed × 25; got ${equipos?.amount})`)
// EDICION: 4 completed jumps × 10 = 40
assert(edicion?.amount === 40,
  `EDICION === 40 (4 jumps × 10; got ${edicion?.amount})`)
// VUELOS: no rate → 0
assert(vuelos?.amount === 0,
  `VUELOS === 0 (no rate; got ${vuelos?.amount})`)

console.log('\n-- Subgroup totals --')
// PERSONAL: 120 + 60 + 45 + 35 = 260
assert(operativos?.subgroupTotals['PERSONAL'] === 260,
  `PERSONAL subgroup total === 260 (got ${operativos?.subgroupTotals['PERSONAL']})`)
// MATERIAL: 300 + 25 + 40 + 0 = 365
assert(operativos?.subgroupTotals['MATERIAL'] === 365,
  `MATERIAL subgroup total === 365 (got ${operativos?.subgroupTotals['MATERIAL']})`)

console.log('\n-- Group totals --')
assert(operativos?.total === 625,
  `COSTES_OPERATIVOS total === 625 (got ${operativos?.total})`)
assert(generales?.total === 100,
  `GENERALES total === 100 (TASAS_AERODROMO FIXED_PER_MONTH × 1; got ${generales?.total})`)

console.log('\n-- Bottom line --')
assert(pnl.costsTotal === 725,
  `costsTotal === 725 (got ${pnl.costsTotal})`)
assert(pnl.ebitda === 415,
  `ebitda === 415 (1140 − 725; got ${pnl.ebitda})`)
assert(approxEqual(pnl.ebitdaMarginPct, 36.40),
  `ebitdaMarginPct ≈ 36.40 (got ${pnl.ebitdaMarginPct.toFixed(4)})`)

// ─── Commission neutralized: no COMISIONES group, no deduction ───────────────
console.log('\n-- Commission neutralized (income already net) --')
assert(!pnl.costGroups.some(g => g.group === ('COMISIONES' as string)),
  'no COMISIONES group in costGroups')
assert(!pnl.costGroups.some(g =>
  g.categories.some(c => c.categoryCode === 'COMISION_CANAL' || c.categoryCode === 'COMISION_GROUPON')
), 'no commission line in any group')

// ─── Regression: null product category must not vanish from breakdown ─────────
console.log('\n-- Regression: null product category (invariant) --')
const nullCatDay: DayPnlRow[] = [
  {
    id: 'reg-day',
    date: '2026-10-05',
    flights: [
      {
        id: 'reg-flight',
        status: 'COMPLETED',
        is_back_to_back: false,
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
const regPnl = buildPnl({ periodLabel: 'reg', days: nullCatDay, expenses: [], categories, monthsInPeriod: 1 })
const regSum = Object.values(regPnl.revenueByCategory).reduce((s, v) => s + (v ?? 0), 0)
assert(regPnl.revenueTotal === 215,
  `null-cat: revenueTotal === 215 (got ${regPnl.revenueTotal})`)
assert(regSum === regPnl.revenueTotal,
  `null-cat: Σ revenueByCategory (${regSum}) === revenueTotal (${regPnl.revenueTotal})`)
assert(regPnl.revenueByCategory.OTHER === 215,
  `null-cat: OTHER bucket === 215 (got ${regPnl.revenueByCategory.OTHER})`)

// ─── Invariant: group reclassification must not change costsTotal or ebitda ───
console.log('\n-- Invariant: group reclassification preserves costsTotal & ebitda --')
const reclassified = categories.map((c) => ({ ...c, groupType: 'COSTES_OPERATIVOS' as const }))
const reclassifiedPnl = buildPnl({ periodLabel: '2026-10', days, expenses, categories: reclassified, monthsInPeriod: 1 })
assert(reclassifiedPnl.costsTotal === pnl.costsTotal,
  `reclassified costsTotal (${reclassifiedPnl.costsTotal}) === base (${pnl.costsTotal})`)
assert(reclassifiedPnl.ebitda === pnl.ebitda,
  `reclassified ebitda (${reclassifiedPnl.ebitda}) === base (${pnl.ebitda})`)

// ─── Manual override: expense rows win over formula ───────────────────────────
console.log('\n-- Manual override: expense row replaces formula for CAMARA_EXTERNA --')
const overrideExpense: Expense[] = [
  {
    id: 'exp-cam', expenseCategoryId: CAT_CAMARA_EXT_ID, operationalDayId: DAY_ID,
    incurredOn: '2026-10-04', description: 'Override cámara', supplier: null, sociedad: null,
    amount: 50, vatRate: null, createdAt: '', updatedAt: '',
  },
]
const overridePnl = buildPnl({ periodLabel: 'override', days, expenses: overrideExpense, categories, monthsInPeriod: 1 })
const overrideCamara = overridePnl.costGroups
  .find(g => g.group === 'COSTES_OPERATIVOS')?.categories
  .find(c => c.categoryCode === 'CAMARA_EXTERNA')
assert(overrideCamara?.amount === 50,
  `override CAMARA_EXTERNA === 50 (manual wins over formula 35; got ${overrideCamara?.amount})`)
const overrideDiff = overridePnl.costsTotal - pnl.costsTotal
assert(overrideDiff === 15,
  `override costsTotal diff === +15 (50 - 35; got ${overrideDiff})`)

// ─── FIXED_PER_MONTH scaling (the 1040×5 bug fix) ─────────────────────────────
// TASAS_AERODROMO is FIXED_PER_MONTH at 100. It must be charged once per
// calendar month (× monthsInPeriod), NEVER once per operational day.
console.log('\n-- FIXED_PER_MONTH scaling --')

// Day view (monthsInPeriod 0): monthly overhead not attributed to a single day.
// The engine always emits both groups; GENERALES carries 0 here (the UI hides
// zero-total groups). This proves the 1040×5 bug is gone: TASAS adds nothing
// per operational day.
const dayView = buildPnl({ periodLabel: 'day', days, expenses, categories, monthsInPeriod: 0 })
const dayGenerales = dayView.costGroups.find(g => g.group === 'GENERALES')
assert(dayGenerales?.total === 0,
  `day view: GENERALES total === 0 (TASAS not charged per day; got ${dayGenerales?.total})`)
assert(dayView.costsTotal === 625,
  `day view: costsTotal === 625 (operativos only, no monthly overhead; got ${dayView.costsTotal})`)

// Month view (monthsInPeriod 1): charged once.
assert(generales?.total === 100,
  `month view: TASAS === 100 (×1; got ${generales?.total})`)

// Year/multi-month view (monthsInPeriod 3): charged 3×, NOT × number of days.
const yearView = buildPnl({ periodLabel: '2026', days, expenses, categories, monthsInPeriod: 3 })
const yearGenerales = yearView.costGroups.find(g => g.group === 'GENERALES')
assert(yearGenerales?.total === 300,
  `multi-month view: TASAS === 300 (100 × 3 months, not × days; got ${yearGenerales?.total})`)

// Manual monthly expense row overrides the FIXED_PER_MONTH auto-rate (no double count).
const monthlyOverride: Expense[] = [
  {
    id: 'exp-rent', expenseCategoryId: CAT_TASAS_ID, operationalDayId: null,
    incurredOn: '2026-10-01', description: 'Renta real octubre', supplier: null, sociedad: null,
    amount: 1240, vatRate: null, createdAt: '', updatedAt: '',
  },
]
const monthlyOverridePnl = buildPnl({ periodLabel: '2026-10', days, expenses: monthlyOverride, categories, monthsInPeriod: 1 })
const moGenerales = monthlyOverridePnl.costGroups.find(g => g.group === 'GENERALES')
assert(moGenerales?.total === 1240,
  `monthly override: TASAS === 1240 (manual row wins, NOT 1240+100; got ${moGenerales?.total})`)

// ─── Cancelled flight: no PER_FLIGHT costs (fuel/pilot), nothing else moves ───
console.log('\n-- Cancelled flight excluded from PER_FLIGHT costs --')
const cancelledFlightDays: DayPnlRow[] = [
  {
    id: DAY_ID,
    date: '2026-10-04',
    flights: [
      ...days[0].flights,
      { id: 'cccc0000-0000-0000-0000-000000000004', status: 'CANCELLED', is_back_to_back: false, participants: [] },
    ],
  },
]
const cfPnl = buildPnl({ periodLabel: 'cf', days: cancelledFlightDays, expenses, categories, monthsInPeriod: 1 })
assert(cfPnl.costsTotal === pnl.costsTotal,
  `cancelled flight: costsTotal unchanged (${pnl.costsTotal}; got ${cfPnl.costsTotal})`)
assert(cfPnl.revenueTotal === pnl.revenueTotal,
  `cancelled flight: revenueTotal unchanged (${pnl.revenueTotal}; got ${cfPnl.revenueTotal})`)

// ─── Cancelled participant: payments only, lingering manual item ignored ─────
console.log('\n-- Cancelled participant counts payments only --')
const PC: ParticipantPnlRow = {
  id: 'dddd0000-0000-0000-0000-000000000006',
  operational_status: 'CANCELLED',
  assigned_instructor_id: I1_ID,
  reservation_group: null,
  instructor: I1,
  payments: [{ amount: 50 }],
  // Manual OW item that survived clearAutoParticipantItems — must NOT count
  // as revenue nor hide the 50€ deposit behind the COALESCE.
  participant_items: [
    { amount: 45, product_id: 'prod-ow', products: { category: 'OVERWEIGHT' } },
  ],
}
const cpDays: DayPnlRow[] = [
  {
    id: 'cp-day',
    date: '2026-10-06',
    flights: [{ id: 'cp-flight', status: 'COMPLETED', is_back_to_back: false, participants: [PC] }],
  },
]
const cpPnl = buildPnl({ periodLabel: 'cp', days: cpDays, expenses: [], categories, monthsInPeriod: 0 })
assert(cpPnl.revenueTotal === 50,
  `cancelled participant: revenueTotal === 50 (deposit only, OW item ignored; got ${cpPnl.revenueTotal})`)
assert(cpPnl.revenueByCategory.SIN_DESGLOSE === 50,
  `cancelled participant: deposit lands in SIN_DESGLOSE (got ${cpPnl.revenueByCategory.SIN_DESGLOSE})`)
assert(cpPnl.revenueByCategory.OVERWEIGHT === undefined,
  `cancelled participant: no OVERWEIGHT revenue line (got ${cpPnl.revenueByCategory.OVERWEIGHT})`)
const cpSum = Object.values(cpPnl.revenueByCategory).reduce((s, v) => s + (v ?? 0), 0)
assert(cpSum === cpPnl.revenueTotal,
  `cancelled participant: Σ revenueByCategory (${cpSum}) === revenueTotal (${cpPnl.revenueTotal})`)

console.log('\n-- Raw output --')
console.log(JSON.stringify(pnl, null, 2))

if (process.exitCode === 1) {
  console.log('\n❌ Some assertions FAILED.\n')
} else {
  console.log('\n✅ All assertions PASSED.\n')
}
