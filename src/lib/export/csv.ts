/**
 * CSV export helpers for Finance P&L v2.
 *
 * Proper escaping: fields containing commas, newlines, or double-quotes
 * are surrounded with double-quotes; existing double-quotes are doubled.
 * UTF-8 BOM prepended for Excel compatibility on Windows.
 */

import type { ProfitAndLoss } from '@/types/domain'
import type { ExpenseWithCategory } from './excel'
import { CATEGORY_LABELS, GROUP_LABELS } from './excel'

// ─── Core CSV primitives ─────────────────────────────────────────────────────

/** Escape a single field value per RFC 4180 */
function escapeField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let str = String(value)
  // Formula-injection guard: a free-text value starting with = + - @ (or tab/CR)
  // is executed as a formula by Excel/Sheets/LibreOffice when the CSV is opened.
  // Prefix with an apostrophe. Only for string values, so numeric cells
  // (including negatives) are never corrupted.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  // Must quote if contains comma, double-quote, newline, or carriage return
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Convert an array of arrays to a CSV string with UTF-8 BOM */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const BOM = '﻿'
  const lines = rows.map((row) => row.map(escapeField).join(','))
  return BOM + lines.join('\r\n')
}

// ─── Ingresos CSV ────────────────────────────────────────────────────────────

/**
 * Build a CSV for the Ingresos table from a ProfitAndLoss object.
 */
export function buildIngresosCsv(pnl: ProfitAndLoss): string {
  const rows: Array<Array<string | number | null>> = [
    ['Período', pnl.periodLabel],
    [],
    ['Categoría', 'Importe (€)', '% s/total'],
  ]

  const orderedCats = [
    'TANDEM_BASE',
    'CAMERA_HANDYCAM',
    'CAMERA_EXTERNAL',
    'PHOTOS',
    'OVERWEIGHT',
    'GROUND_REPORT',
    'OTHER',
    'SIN_DESGLOSE',
    'DEPOSITO_RETENIDO',
  ] as const

  for (const cat of orderedCats) {
    const amount =
      cat === 'SIN_DESGLOSE'
        ? (pnl.revenueByCategory.SIN_DESGLOSE ?? 0)
        : (pnl.revenueByCategory[cat] ?? 0)
    if (amount === 0) continue

    const pct = pnl.revenueTotal !== 0 ? (amount / pnl.revenueTotal) * 100 : 0
    rows.push([CATEGORY_LABELS[cat], amount, Math.round(pct * 100) / 100])
  }

  rows.push(['TOTAL INGRESOS', pnl.revenueTotal, 100])

  return toCsv(rows)
}

// ─── Gastos CSV ──────────────────────────────────────────────────────────────

/**
 * Build a CSV for the Gastos table from real expense rows + P&L derived lines.
 */
export function buildGastosCsv(
  expenses: ExpenseWithCategory[],
  pnl: ProfitAndLoss
): string {
  const rows: Array<Array<string | number | null>> = [
    ['Período', pnl.periodLabel],
    [],
    [
      'Fecha',
      'Categoría',
      'Grupo',
      'Descripción',
      'PROVEEDOR',
      'SOCIEDAD',
      'Importe (€)',
      'IVA %',
    ],
  ]

  // Sum of real (invoiced) rows per category, so derived formula lines below
  // show only the non-itemized portion (avoids double-count; foots to costsTotal).
  const realByCat = new Map<string, number>()
  for (const exp of expenses) {
    realByCat.set(exp.categoryName, (realByCat.get(exp.categoryName) ?? 0) + exp.amount)
  }

  // Real expense rows (with supplier / sociedad detail)
  for (const exp of expenses) {
    rows.push([
      exp.incurredOn,
      exp.categoryName,
      GROUP_LABELS[exp.groupType],
      exp.description ?? '',
      exp.supplier ?? '',
      exp.sociedad ?? '',
      exp.amount,
      exp.vatRate !== null ? exp.vatRate : '',
    ])
  }

  // Formula-calculated cost lines = category cost minus its real rows.
  rows.push([])
  rows.push(['Costes calculados (fórmula)'])
  rows.push([
    'Fecha',
    'Categoría',
    'Grupo',
    'Descripción',
    'PROVEEDOR',
    'SOCIEDAD',
    'Importe (€)',
    'IVA %',
  ])

  for (const group of pnl.costGroups) {
    for (const cat of group.categories) {
      const realSum = realByCat.get(cat.name) ?? 0
      const derived = Math.round((cat.amount - realSum) * 100) / 100
      if (derived === 0) continue
      rows.push([
        '',
        cat.name,
        GROUP_LABELS[group.group],
        '(calculado)',
        '',
        '',
        derived,
        '',
      ])
    }
  }

  rows.push([])
  rows.push(['TOTAL GASTOS', '', '', '', '', '', pnl.costsTotal, ''])

  return toCsv(rows)
}
