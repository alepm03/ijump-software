import type { WaiverDocumentType, WaiverFormData } from '@/types/domain'
import { WAIVER_TITLE, WAIVER_LEGAL_TEXT, HEALTH_ITEMS, WAIVER_FIELDS } from '@/lib/waiver-templates/waiver'
import { RGPD_TITLE, RGPD_LEGAL_TEXT, CONSENT_ITEMS, RGPD_FIELDS } from '@/lib/waiver-templates/rgpd'

/**
 * Generates a PDF for a signed waiver or RGPD document.
 * Returns the raw base64 string (no data URI prefix).
 * Must run client-side (jsPDF is a browser library).
 */
export async function generateWaiverPdf(
  documentType: WaiverDocumentType,
  formData: WaiverFormData,
  signatureDataUrl: string,
  participantName: string
): Promise<string> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentW = pageW - 2 * margin
  let y = margin

  function checkPageBreak(needed: number) {
    if (y + needed > pageH - margin) {
      doc.addPage()
      y = margin
    }
  }

  function sectionTitle(text: string) {
    checkPageBreak(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    doc.text(text, margin, y)
    y += 7
    doc.setDrawColor(230, 230, 230)
    doc.line(margin, y - 2, pageW - margin, y - 2)
    y += 3
  }

  function divider() {
    y += 4
    doc.setDrawColor(230, 230, 230)
    doc.line(margin, y, pageW - margin, y)
    y += 6
  }

  const title = documentType === 'WAIVER' ? WAIVER_TITLE : RGPD_TITLE
  const legalText = documentType === 'WAIVER' ? WAIVER_LEGAL_TEXT : RGPD_LEGAL_TEXT
  const fields = documentType === 'WAIVER' ? WAIVER_FIELDS : RGPD_FIELDS

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(226, 90, 20)
  doc.rect(0, 0, pageW, 14, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(255, 255, 255)
  doc.text('iJump', margin, 9)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(title, margin + 20, 9)
  y = 22

  // ── Meta ─────────────────────────────────────────────────────────────────────
  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text(`Participante: ${participantName}`, margin, y)
  y += 5
  doc.text(
    `Fecha: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    margin,
    y
  )
  y += 10

  // ── Personal data fields ─────────────────────────────────────────────────────
  sectionTitle('DATOS PERSONALES')
  doc.setFont('helvetica', 'normal')

  for (const field of fields) {
    checkPageBreak(7)
    const value = String((formData as unknown as Record<string, unknown>)[field.key] ?? '—')
    doc.setFontSize(8.5)
    doc.setTextColor(100, 100, 100)
    doc.text(`${field.label}:`, margin, y)
    doc.setTextColor(30, 30, 30)
    doc.text(value || '—', margin + 60, y)
    y += 6
  }

  divider()

  // ── Checkboxes ───────────────────────────────────────────────────────────────
  if (documentType === 'WAIVER') {
    sectionTitle('DECLARACIONES DE SEGURIDAD')
    doc.setFont('helvetica', 'normal')

    for (const [key, label] of Object.entries(HEALTH_ITEMS)) {
      const checked = formData.healthDeclaration?.[key] === true
      const prefix = checked ? '[X]' : '[ ]'
      const lines = doc.splitTextToSize(`${prefix} ${label}`, contentW - 4)
      checkPageBreak(lines.length * 5.5 + 2)
      doc.setFontSize(8.5)
      doc.setTextColor(checked ? 30 : 160, 30, 30)
      for (const line of lines) {
        doc.text(line, margin + 2, y)
        y += 5.5
      }
      y += 1
    }
  } else {
    sectionTitle('CONSENTIMIENTOS')
    doc.setFont('helvetica', 'normal')

    for (const item of CONSENT_ITEMS) {
      const checked = formData.consents?.[item.key] === true
      const prefix = checked ? '[X]' : '[ ]'
      const required = item.required ? ' (obligatorio)' : ' (opcional)'
      const lines = doc.splitTextToSize(`${prefix} ${item.label}${required}`, contentW - 4)
      checkPageBreak(lines.length * 5.5 + 2)
      doc.setFontSize(8.5)
      doc.setTextColor(30, 30, 30)
      for (const line of lines) {
        doc.text(line, margin + 2, y)
        y += 5.5
      }
      y += 1
    }
  }

  divider()

  // ── Legal text ───────────────────────────────────────────────────────────────
  sectionTitle('TEXTO LEGAL')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)

  const legalLines = doc.splitTextToSize(legalText, contentW)
  for (const line of legalLines) {
    checkPageBreak(5)
    doc.text(line, margin, y)
    y += 5
  }

  divider()

  // ── Signature ────────────────────────────────────────────────────────────────
  checkPageBreak(60)
  sectionTitle('FIRMA')

  try {
    doc.addImage(signatureDataUrl, 'PNG', margin, y, 80, 36)
    y += 42
  } catch {
    doc.setFontSize(8)
    doc.text('[Firma digital capturada]', margin, y)
    y += 12
  }

  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text(
    `Documento firmado digitalmente el ${new Date().toLocaleString('es-ES')}`,
    margin,
    y
  )

  const dataUri = doc.output('datauristring')
  return dataUri.substring(dataUri.indexOf(',') + 1)
}
