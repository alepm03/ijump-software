/**
 * Excel export for Finance P&L v2.
 * Produces a workbook with 3 sheets: Ingresos, Gastos, Resumen P&L.
 *
 * Designed to be callable with an in-memory ProfitAndLoss (no DB calls here)
 * so it can be unit-tested without a database.
 */

import ExcelJS from 'exceljs'
import type { ProfitAndLoss, Expense, ProductCategory, ExpenseGroup } from '@/types/domain'

// ─── Category display labels ─────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<ProductCategory | 'SIN_DESGLOSE', string> = {
  TANDEM_BASE: 'Tándem base',
  CAMERA_HANDYCAM: 'Handycam',
  CAMERA_EXTERNAL: 'Cámara externa',
  PHOTOS: 'Fotos',
  OVERWEIGHT: 'OW (sobrepeso)',
  GROUND_REPORT: 'Reportaje en tierra',
  OTHER: 'Otros',
  SIN_DESGLOSE: 'Sin desglosar (histórico)',
}

export const GROUP_LABELS: Record<ExpenseGroup, string> = {
  COSTES_DIRECTOS: 'Costes Directos',
  COMISIONES: 'Comisiones',
  PERSONAL: 'Personal',
  GENERALES: 'Generales',
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

const EUR_FORMAT = '#,##0.00 €'
const PCT_FORMAT = '0.00%'

/**
 * Neutralize spreadsheet formula injection in free-text fields: a value
 * starting with = + - @ (or tab/CR) can be executed as a formula by
 * spreadsheet apps. Prefix it with an apostrophe so it renders as literal
 * text. Applied only to user-entered text (never numeric cells).
 */
function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

// Palette — iJump brand orange + neutral greys
const BRAND_ORANGE = 'FFE25A14'
const HEADER_BG = 'FF2D2D2D'
const SUBHEADER_BG = 'FF4A4A4A'
const GROUP_BG = 'FFF5F5F5'
const TOTAL_BG = 'FFFFD700'
const WHITE = 'FFFFFFFF'
const LIGHT_GREY = 'FFEAEAEA'

function headerStyle(bgArgb: string): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, color: { argb: WHITE }, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
    border: {
      bottom: { style: 'thin', color: { argb: 'FF888888' } },
    },
  }
}

function totalStyle(bgArgb: string = TOTAL_BG): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } },
    numFmt: EUR_FORMAT,
  }
}

function groupHeaderStyle(): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, size: 10, color: { argb: WHITE } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBHEADER_BG } },
    numFmt: EUR_FORMAT,
  }
}

function applyRowStyle(row: ExcelJS.Row, style: Partial<ExcelJS.Style>) {
  row.eachCell((cell) => {
    Object.assign(cell, { style: { ...cell.style, ...style } })
  })
}

// ─── Sheet 1 — Ingresos ──────────────────────────────────────────────────────

function buildIngresosSheet(ws: ExcelJS.Worksheet, pnl: ProfitAndLoss): void {
  ws.columns = [
    { key: 'category', header: 'Categoría', width: 30 },
    { key: 'amount', header: 'Importe', width: 16 },
    { key: 'pct', header: '% s/total', width: 14 },
  ]

  // Header row
  const headerRow = ws.getRow(1)
  headerRow.values = ['Categoría', 'Importe', '% s/total']
  applyRowStyle(headerRow, headerStyle(HEADER_BG))
  headerRow.height = 20

  const orderedCats: Array<ProductCategory | 'SIN_DESGLOSE'> = [
    'TANDEM_BASE',
    'CAMERA_HANDYCAM',
    'CAMERA_EXTERNAL',
    'PHOTOS',
    'OVERWEIGHT',
    'GROUND_REPORT',
    'OTHER',
    'SIN_DESGLOSE',
  ]

  let rowIndex = 2
  const revenueTotal = pnl.revenueTotal

  for (const cat of orderedCats) {
    const amount = pnl.revenueByCategory[cat as ProductCategory] ?? pnl.revenueByCategory.SIN_DESGLOSE ?? 0
    // For non-SIN_DESGLOSE use the typed access
    const actualAmount =
      cat === 'SIN_DESGLOSE'
        ? (pnl.revenueByCategory.SIN_DESGLOSE ?? 0)
        : (pnl.revenueByCategory[cat as ProductCategory] ?? 0)

    if (actualAmount === 0) continue

    const pct = revenueTotal !== 0 ? actualAmount / revenueTotal : 0
    const row = ws.getRow(rowIndex++)
    row.values = [CATEGORY_LABELS[cat], actualAmount, pct]

    row.getCell('amount').numFmt = EUR_FORMAT
    row.getCell('pct').numFmt = PCT_FORMAT
    row.getCell('pct').alignment = { horizontal: 'right' }

    if (rowIndex % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GREY } }
      })
    }
    row.commit()
  }

  // Total row
  const totalRow = ws.getRow(rowIndex)
  totalRow.values = ['TOTAL INGRESOS', revenueTotal, 1]
  totalRow.getCell('amount').numFmt = EUR_FORMAT
  totalRow.getCell('pct').numFmt = PCT_FORMAT
  applyRowStyle(totalRow, totalStyle(BRAND_ORANGE))
  totalRow.commit()
}

// ─── Sheet 2 — Gastos ────────────────────────────────────────────────────────

export interface ExpenseWithCategory extends Expense {
  categoryName: string
  groupType: ExpenseGroup
}

function buildGastosSheet(
  ws: ExcelJS.Worksheet,
  expenses: ExpenseWithCategory[],
  pnl: ProfitAndLoss
): void {
  ws.columns = [
    { key: 'fecha', header: 'Fecha', width: 14 },
    { key: 'categoria', header: 'Categoría', width: 22 },
    { key: 'grupo', header: 'Grupo', width: 18 },
    { key: 'descripcion', header: 'Descripción', width: 30 },
    { key: 'proveedor', header: 'PROVEEDOR', width: 20 },
    { key: 'sociedad', header: 'SOCIEDAD', width: 18 },
    { key: 'importe', header: 'Importe', width: 14 },
    { key: 'iva', header: 'IVA %', width: 10 },
  ]

  const headerRow = ws.getRow(1)
  headerRow.values = [
    'Fecha',
    'Categoría',
    'Grupo',
    'Descripción',
    'PROVEEDOR',
    'SOCIEDAD',
    'Importe',
    'IVA %',
  ]
  applyRowStyle(headerRow, headerStyle(HEADER_BG))
  headerRow.height = 20

  let rowIndex = 2

  // Sum of real (invoiced) expense rows per category. The derived formula
  // lines below show only the portion NOT already itemized as a real row,
  // so overrides are not double-counted and the visible rows foot to costsTotal.
  const realByCat = new Map<string, number>()
  for (const exp of expenses) {
    realByCat.set(exp.categoryName, (realByCat.get(exp.categoryName) ?? 0) + exp.amount)
  }

  // Real expense rows (with supplier / sociedad detail)
  for (const exp of expenses) {
    const row = ws.getRow(rowIndex++)
    row.values = [
      exp.incurredOn,
      safeText(exp.categoryName),
      GROUP_LABELS[exp.groupType],
      safeText(exp.description ?? ''),
      safeText(exp.supplier ?? ''),
      safeText(exp.sociedad ?? ''),
      exp.amount,
      exp.vatRate !== null ? exp.vatRate / 100 : '',
    ]
    row.getCell('importe').numFmt = EUR_FORMAT
    if (exp.vatRate !== null) row.getCell('iva').numFmt = PCT_FORMAT

    if (rowIndex % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GREY } }
      })
    }
    row.commit()
  }

  // Separator
  rowIndex++

  // Formula-calculated cost lines = category cost MINUS its real rows.
  // Override categories (cost == real rows) yield 0 and are skipped;
  // INSTRUCTORES yields the per-jump payout portion; unitemized categories
  // yield the full formula amount. Sum(real) + Sum(derived) === costsTotal.
  const derivedHeaderRow = ws.getRow(rowIndex++)
  derivedHeaderRow.values = ['Costes calculados (fórmula)']
  derivedHeaderRow.getCell(1).font = { italic: true, color: { argb: 'FF666666' } }
  ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, 8)
  derivedHeaderRow.commit()

  for (const group of pnl.costGroups) {
    for (const cat of group.categories) {
      const realSum = realByCat.get(cat.name) ?? 0
      const derived = Math.round((cat.amount - realSum) * 100) / 100
      if (derived === 0) continue
      const row = ws.getRow(rowIndex++)
      row.values = [
        '',
        safeText(cat.name),
        GROUP_LABELS[group.group],
        '(calculado)',
        '',
        '',
        derived,
        '',
      ]
      row.getCell('importe').numFmt = EUR_FORMAT
      row.getCell(1).font = { italic: true }
      row.commit()
    }
  }

  // Total row
  const totalRow = ws.getRow(rowIndex)
  totalRow.values = ['', 'TOTAL GASTOS', '', '', '', '', pnl.costsTotal, '']
  totalRow.getCell('importe').numFmt = EUR_FORMAT
  applyRowStyle(totalRow, totalStyle(BRAND_ORANGE))
  totalRow.commit()
}

// ─── Sheet 3 — Resumen P&L ───────────────────────────────────────────────────

function buildResumenSheet(ws: ExcelJS.Worksheet, pnl: ProfitAndLoss): void {
  ws.columns = [
    { key: 'concepto', header: 'Concepto', width: 34 },
    { key: 'importe', header: 'Importe', width: 18 },
    { key: 'margen', header: 'Margen %', width: 14 },
  ]

  let rowIndex = 1

  function addTitle(text: string): void {
    const row = ws.getRow(rowIndex++)
    ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, 3)
    row.getCell(1).value = text
    row.getCell(1).style = {
      font: { bold: true, size: 12, color: { argb: WHITE } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } },
      alignment: { vertical: 'middle' },
    }
    row.height = 22
    row.commit()
  }

  function addSectionHeader(text: string, amount: number): void {
    const row = ws.getRow(rowIndex++)
    row.values = [text, amount, '']
    row.getCell(2).numFmt = EUR_FORMAT
    applyRowStyle(row, groupHeaderStyle())
    row.commit()
  }

  function addLine(label: string, amount: number, indent = false): void {
    const row = ws.getRow(rowIndex++)
    row.values = [indent ? `  ${label}` : label, amount, '']
    row.getCell(2).numFmt = EUR_FORMAT
    if (rowIndex % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_BG } }
      })
    }
    row.commit()
  }

  function addTotal(label: string, amount: number, pct?: number): void {
    const row = ws.getRow(rowIndex++)
    row.values = [label, amount, pct !== undefined ? pct / 100 : '']
    row.getCell(2).numFmt = EUR_FORMAT
    if (pct !== undefined) row.getCell(3).numFmt = PCT_FORMAT
    applyRowStyle(row, totalStyle(TOTAL_BG))
    row.getCell(1).font = { bold: true, size: 11 }
    row.commit()
  }

  // ── Header ────────────────────────────────────────────────────────────────
  addTitle(`P&L — ${pnl.periodLabel}`)

  // ── INGRESOS section ──────────────────────────────────────────────────────
  {
    const row = ws.getRow(rowIndex++)
    ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, 3)
    row.getCell(1).value = 'INGRESOS'
    row.getCell(1).style = {
      font: { bold: true, size: 10, color: { argb: WHITE } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ORANGE } },
      alignment: { vertical: 'middle' },
    }
    row.height = 18
    row.commit()
  }

  const orderedCats: Array<ProductCategory | 'SIN_DESGLOSE'> = [
    'TANDEM_BASE',
    'CAMERA_HANDYCAM',
    'CAMERA_EXTERNAL',
    'PHOTOS',
    'OVERWEIGHT',
    'GROUND_REPORT',
    'OTHER',
    'SIN_DESGLOSE',
  ]

  for (const cat of orderedCats) {
    const amount =
      cat === 'SIN_DESGLOSE'
        ? (pnl.revenueByCategory.SIN_DESGLOSE ?? 0)
        : (pnl.revenueByCategory[cat as ProductCategory] ?? 0)
    if (amount === 0) continue
    addLine(CATEGORY_LABELS[cat], amount, true)
  }

  addTotal('TOTAL INGRESOS', pnl.revenueTotal)

  // ── GASTOS section ────────────────────────────────────────────────────────
  {
    const row = ws.getRow(rowIndex++)
    ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, 3)
    row.getCell(1).value = 'GASTOS'
    row.getCell(1).style = {
      font: { bold: true, size: 10, color: { argb: WHITE } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ORANGE } },
      alignment: { vertical: 'middle' },
    }
    row.height = 18
    row.commit()
  }

  for (const group of pnl.costGroups) {
    if (group.total === 0) continue
    addSectionHeader(GROUP_LABELS[group.group], group.total)
    for (const cat of group.categories) {
      if (cat.amount === 0) continue
      addLine(cat.name, cat.amount, true)
    }
  }

  addTotal('TOTAL GASTOS', pnl.costsTotal)

  // ── EBITDA ────────────────────────────────────────────────────────────────
  const ebitdaRow = ws.getRow(rowIndex++)
  ws.mergeCells(rowIndex - 1, 1, rowIndex - 1, 3)
  ebitdaRow.commit()

  addTotal('EBITDA', pnl.ebitda, pnl.ebitdaMarginPct)

  // Named range for self-test: tag the EBITDA cell so the test can find it by name
  // The EBITDA amount is always in column B (2) of the EBITDA row
  const ebitdaAmountCellRef = `B${rowIndex - 1}`
  ws.getCell(ebitdaAmountCellRef).name = 'EBITDA'
}

// ─── Public builder ──────────────────────────────────────────────────────────

export interface FinancePnlWorkbookOptions {
  pnl: ProfitAndLoss
  /** Real expense rows (from listExpenses) with resolved category metadata */
  expenses: ExpenseWithCategory[]
}

/**
 * Build an ExcelJS workbook with 3 sheets mirroring the P&L structure.
 * Can be called without DB access — all data must be pre-fetched.
 */
export async function buildFinancePnlWorkbook(
  opts: FinancePnlWorkbookOptions
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'iJump'
  wb.created = new Date()
  wb.modified = new Date()
  wb.properties.date1904 = false

  const wsIngresos = wb.addWorksheet('Ingresos', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  })
  const wsGastos = wb.addWorksheet('Gastos', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  })
  const wsResumen = wb.addWorksheet('Resumen P&L')

  buildIngresosSheet(wsIngresos, opts.pnl)
  buildGastosSheet(wsGastos, opts.expenses, opts.pnl)
  buildResumenSheet(wsResumen, opts.pnl)

  return wb
}

/**
 * Serialize the workbook to a Uint8Array (compatible with Web API Response body).
 */
export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  // ExcelJS returns Buffer (Node) or ArrayBuffer. Normalize to Uint8Array.
  const result = await wb.xlsx.writeBuffer()
  if (result instanceof ArrayBuffer) {
    return new Uint8Array(result)
  }
  // Node Buffer is a subclass of Uint8Array — safe to cast
  return new Uint8Array(result as unknown as ArrayBuffer)
}
