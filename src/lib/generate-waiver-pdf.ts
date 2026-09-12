import type { WaiverDocumentType, WaiverFormData } from '../types/domain'
import { getWaiverTemplate } from './waiver-templates/registry'

/**
 * Generates a PDF for a signed legal document.
 * Returns the raw base64 string (no data URI prefix).
 * Runs server-side (jsPDF v4 has no DOM dependency and works in Node) so the
 * legal document's content cannot be tampered with by the client.
 */
export async function generateWaiverPdf(
  documentType: WaiverDocumentType,
  formData: WaiverFormData,
  signatureDataUrl: string,
  participantName: string,
  // Only for templates that declare `witness` — the one witness the original
  // paper's two witnesses were simplified to (business decision 2026-09-11).
  witnessSignatureDataUrl?: string
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

  const template = getWaiverTemplate(documentType)
  const { title, legalText, fields } = template

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
    const stored = String((formData as unknown as Record<string, unknown>)[field.key] ?? '—')
    // A select stores its option value ("ADULTO"); the signed document has to
    // show what the person actually picked ("Adulto — 179€"), fee included.
    const value = field.options?.find((o) => o.value === stored)?.label ?? stored
    doc.setFontSize(8.5)
    doc.setTextColor(100, 100, 100)
    doc.text(`${field.label}:`, margin, y)
    doc.setTextColor(30, 30, 30)
    doc.text(value || '—', margin + 60, y)
    y += 6
  }

  divider()

  // ── Checkboxes ───────────────────────────────────────────────────────────────
  const group = template.checkboxes
  if (group) {
    sectionTitle(group.sectionTitle)
    doc.setFont('helvetica', 'normal')

    const answers = formData[group.field] ?? {}

    for (const item of group.items) {
      const checked = answers[item.key] === true
      const prefix = checked ? '[X]' : '[ ]'
      // An all-required group already says so in its heading, so repeating it
      // per line would be noise; a mixed group needs the label on every item.
      const suffix = group.allRequired ? '' : item.required ? ' (obligatorio)' : ' (opcional)'
      const lines = doc.splitTextToSize(`${prefix} ${item.label}${suffix}`, contentW - 4)
      checkPageBreak(lines.length * 5.5 + 2)
      doc.setFontSize(8.5)
      // Unticked items are flagged red only where every item is mandatory.
      doc.setTextColor(!checked && group.allRequired ? 160 : 30, 30, 30)
      for (const line of lines) {
        doc.text(line, margin + 2, y)
        y += 5.5
      }
      y += 1
    }

    divider()
  }

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
  y += 10

  // ── Witness (only where the template declares one) ──────────────────────────
  // The original paper required two witnesses (name, DNI, edad, firma each).
  // Simplified to one — see WaiverFormData.witnessName.
  if (template.witness && formData.witnessName) {
    divider()
    checkPageBreak(60)
    sectionTitle('TESTIGO')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(100, 100, 100)
    doc.text('Nombre:', margin, y)
    doc.setTextColor(30, 30, 30)
    doc.text(formData.witnessName || '—', margin + 22, y)
    y += 6

    doc.setTextColor(100, 100, 100)
    doc.text('DNI:', margin, y)
    doc.setTextColor(30, 30, 30)
    doc.text(formData.witnessDni || '—', margin + 22, y)
    y += 6

    doc.setTextColor(100, 100, 100)
    doc.text('Edad:', margin, y)
    doc.setTextColor(30, 30, 30)
    doc.text(formData.witnessAge || '—', margin + 22, y)
    y += 8

    if (witnessSignatureDataUrl) {
      try {
        doc.addImage(witnessSignatureDataUrl, 'PNG', margin, y, 80, 36)
        y += 42
      } catch {
        doc.setFontSize(8)
        doc.text('[Firma del testigo capturada]', margin, y)
        y += 12
      }
    }
  }

  const dataUri = doc.output('datauristring')
  return dataUri.substring(dataUri.indexOf(',') + 1)
}
