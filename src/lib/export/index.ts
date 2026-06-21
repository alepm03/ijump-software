/**
 * Export layer — Finance P&L v2
 * Re-exports all public builders from sub-modules.
 */

export type { ExpenseWithCategory, FinancePnlWorkbookOptions } from './excel'
export { buildFinancePnlWorkbook, workbookToBuffer, CATEGORY_LABELS, GROUP_LABELS } from './excel'

export { toCsv, buildIngresosCsv, buildGastosCsv } from './csv'

export { buildFinancePnlPdf } from './pdf'
