/**
 * __gastos_check.mts — regression for the Gastos export footing fix.
 *
 * Run with:  node_modules/.bin/jiti src/lib/export/__gastos_check.mts
 *
 * Scenario with an OVERRIDE (the case the code review proved double-counted):
 *   COMBUSTIBLE  cost 80, with a real expense row of 80  (override → derived 0)
 *   INSTRUCTORES cost 150, no real rows                  (formula → derived 150)
 *   GENERALES    cost 30, with a real expense row of 30  (override → derived 0)
 *   costsTotal = 260
 * The visible importe rows (real + "(calculado)") must foot to exactly 260.
 */

import { buildGastosCsv } from './csv.js'
import type { ExpenseWithCategory } from './excel.js'
import type { ProfitAndLoss } from '../../types/domain.js'

const pnl: ProfitAndLoss = {
  periodLabel: 'test',
  revenueTotal: 1000,
  revenueByCategory: { TANDEM_BASE: 1000 },
  costGroups: [
    {
      group: 'MATERIA_PRIMA',
      total: 80,
      categories: [
        { categoryCode: 'COMBUSTIBLE', name: 'Combustible', group: 'MATERIA_PRIMA', amount: 80 },
      ],
    },
    {
      group: 'PERSONAL',
      total: 150,
      categories: [
        { categoryCode: 'INSTRUCTORES', name: 'Instructores', group: 'PERSONAL', amount: 150 },
      ],
    },
    {
      group: 'GENERALES',
      total: 30,
      categories: [
        { categoryCode: 'GENERALES', name: 'Generales', group: 'GENERALES', amount: 30 },
      ],
    },
  ],
  costsTotal: 260,
  ebitda: 740,
  ebitdaMarginPct: 74,
}

const expenses: ExpenseWithCategory[] = [
  {
    id: 'e1', expenseCategoryId: 'c1', operationalDayId: 'd1', incurredOn: '2026-10-04',
    description: 'fuel', supplier: 'Repsol', sociedad: 'S1', amount: 80, vatRate: null,
    createdAt: '', updatedAt: '', categoryName: 'Combustible', groupType: 'MATERIA_PRIMA',
  },
  {
    id: 'e2', expenseCategoryId: 'c2', operationalDayId: 'd1', incurredOn: '2026-10-04',
    description: 'varios', supplier: null, sociedad: null, amount: 30, vatRate: null,
    createdAt: '', updatedAt: '', categoryName: 'Generales', groupType: 'GENERALES',
  },
]

const csv = buildGastosCsv(expenses, pnl)
const lines = csv.replace(/^﻿/, '').split('\r\n')

let visible = 0
for (const line of lines) {
  const cols = line.split(',')
  if (cols[0] === 'TOTAL GASTOS') continue // exclude the stamped total row
  const imp = Number(cols[6])
  if (cols.length >= 7 && cols[6] !== '' && !Number.isNaN(imp)) visible += imp
}

console.log('\n=== Gastos footing check (override double-count regression) ===')
console.log(`  visible importe rows sum: ${visible}`)
console.log(`  pnl.costsTotal:           ${pnl.costsTotal}`)
if (Math.abs(visible - pnl.costsTotal) < 0.005) {
  console.log('  ✅ PASS: Gastos rows foot to costsTotal (no double-count)\n')
} else {
  console.error('  ❌ FAIL: Gastos rows do NOT foot to costsTotal\n')
  process.exitCode = 1
}
