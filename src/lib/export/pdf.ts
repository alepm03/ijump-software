/**
 * PDF export for Finance P&L v2.
 * Uses jsPDF following the same pattern as src/lib/generate-waiver-pdf.ts.
 *
 * Must run server-side (Node.js) or client-side depending on jsPDF build.
 * jsPDF v4 supports Node.js natively.
 *
 * Returns raw bytes (Buffer / Uint8Array) suitable for streaming in a Response.
 */

import type { ProfitAndLoss } from '@/types/domain'
import { CATEGORY_LABELS, GROUP_LABELS } from './excel'
import type { ExpenseGroup } from '@/types/domain'

// ─── Currency formatter ──────────────────────────────────────────────────────

function eur(amount: number): string {
  return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function pct(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2) + ' %'
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

/**
 * Build a one-page P&L PDF report from a ProfitAndLoss object.
 * Returns a Buffer containing the PDF bytes.
 *
 * Can be called without DB access — all data must be pre-fetched.
 */
export async function buildFinancePnlPdf(pnl: ProfitAndLoss): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 18
  const colLabel = margin
  const colAmount = pageW - margin - 30
  const colRight = pageW - margin
  const contentW = pageW - 2 * margin
  let y = 0

  function checkPageBreak(needed: number): void {
    if (y + needed > pageH - margin) {
      doc.addPage()
      y = margin
    }
  }

  function drawLine(color: number[] = [220, 220, 220]): void {
    doc.setDrawColor(color[0], color[1], color[2])
    doc.line(margin, y, pageW - margin, y)
  }

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(226, 90, 20)  // iJump brand orange
  doc.rect(0, 0, pageW, 16, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text('iJump', margin, 10.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Informe P&L', margin + 22, 10.5)

  // Period label on the right
  doc.setFontSize(8)
  doc.setTextColor(240, 240, 240)
  doc.text(`Período: ${pnl.periodLabel}`, pageW - margin, 10.5, { align: 'right' })
  y = 22

  // ── Generated date ──────────────────────────────────────────────────────────
  doc.setFontSize(7.5)
  doc.setTextColor(120, 120, 120)
  doc.text(
    `Generado: ${new Date().toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    pageW - margin,
    y,
    { align: 'right' }
  )
  y += 8

  // ─── Helper: section heading bar ─────────────────────────────────────────

  function sectionHeading(label: string): void {
    checkPageBreak(10)
    doc.setFillColor(45, 45, 45)
    doc.rect(margin, y - 4, contentW, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(label, colLabel + 2, y + 0.5)
    y += 8
  }

  function groupHeading(label: string, amount: number): void {
    checkPageBreak(8)
    doc.setFillColor(74, 74, 74)
    doc.rect(margin, y - 3.5, contentW, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    doc.text(label, colLabel + 2, y + 0.2)
    doc.text(eur(amount), colRight, y + 0.2, { align: 'right' })
    y += 7
  }

  function dataRow(label: string, amount: number, indent = false): void {
    checkPageBreak(7)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(40, 40, 40)
    doc.text(indent ? `    ${label}` : label, colLabel, y)
    doc.setFont('helvetica', 'normal')
    doc.text(eur(amount), colRight, y, { align: 'right' })
    y += 6
  }

  function totalRow(label: string, amount: number, marginPct?: number): void {
    checkPageBreak(10)
    doc.setFillColor(255, 215, 0) // gold
    doc.rect(margin, y - 4, contentW, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(30, 30, 30)
    doc.text(label, colLabel + 2, y + 0.5)
    doc.text(eur(amount), colRight, y + 0.5, { align: 'right' })
    if (marginPct !== undefined) {
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      doc.text(`Margen: ${pct(marginPct)}`, colAmount, y + 0.5, { align: 'right' })
    }
    y += 9
  }

  // ─── INGRESOS ─────────────────────────────────────────────────────────────

  sectionHeading('INGRESOS')
  y += 1

  const orderedCats = [
    'TANDEM_BASE',
    'CAMERA_HANDYCAM',
    'CAMERA_EXTERNAL',
    'PHOTOS',
    'OVERWEIGHT',
    'GROUND_REPORT',
    'OTHER',
    'SIN_DESGLOSE',
  ] as const

  for (const cat of orderedCats) {
    const amount =
      cat === 'SIN_DESGLOSE'
        ? (pnl.revenueByCategory.SIN_DESGLOSE ?? 0)
        : (pnl.revenueByCategory[cat] ?? 0)
    if (amount === 0) continue
    dataRow(CATEGORY_LABELS[cat], amount, true)
  }

  y += 2
  drawLine()
  y += 3
  totalRow('TOTAL INGRESOS', pnl.revenueTotal)

  y += 4

  // ─── GASTOS ───────────────────────────────────────────────────────────────

  sectionHeading('GASTOS')
  y += 1

  const groupOrder: ExpenseGroup[] = ['COSTES_OPERATIVOS', 'GENERALES']

  for (const groupKey of groupOrder) {
    const group = pnl.costGroups.find((g) => g.group === groupKey)
    if (!group || group.total === 0) continue

    groupHeading(GROUP_LABELS[groupKey], group.total)
    y += 1

    for (const cat of group.categories) {
      if (cat.amount === 0) continue
      dataRow(cat.name, cat.amount, true)
    }

    y += 2
  }

  drawLine()
  y += 3
  totalRow('TOTAL GASTOS', pnl.costsTotal)

  y += 6

  // ─── EBITDA ───────────────────────────────────────────────────────────────

  checkPageBreak(16)

  // Highlight box for EBITDA
  const ebitdaColor = pnl.ebitda >= 0 ? [34, 139, 34] : [180, 0, 0] // green / red
  doc.setFillColor(ebitdaColor[0], ebitdaColor[1], ebitdaColor[2])
  doc.rect(margin, y - 5, contentW, 13, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(255, 255, 255)
  doc.text('EBITDA', colLabel + 4, y + 2)
  doc.text(eur(pnl.ebitda), colRight, y + 2, { align: 'right' })
  doc.setFontSize(9)
  doc.setTextColor(220, 255, 220)
  doc.text(`Margen: ${pct(pnl.ebitdaMarginPct)}`, colAmount, y + 2, { align: 'right' })
  y += 14

  // ─── Footer ───────────────────────────────────────────────────────────────

  const totalPages = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text(
      `iJump — ${pnl.periodLabel} — pág. ${i} de ${totalPages}`,
      pageW / 2,
      pageH - 8,
      { align: 'center' }
    )
  }

  // Return as Uint8Array (compatible with Web API Response body)
  const ab = doc.output('arraybuffer') as ArrayBuffer
  return new Uint8Array(ab)
}
