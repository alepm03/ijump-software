/**
 * __waiver_pdf_check.mts — regression for server-side waiver PDF generation.
 *
 * Run with:  node_modules/.bin/jiti src/lib/__waiver_pdf_check.mts
 *
 * H1 (AUDITORIA.md) moved PDF generation from the browser to the server so a
 * client can no longer upload an arbitrary PDF as the legal waiver document.
 * This check proves generateWaiverPdf still produces a real PDF in Node for
 * both document types, using a minimal 1x1 PNG as the signature image.
 */

import { generateWaiverPdf } from './generate-waiver-pdf.js'
import type { WaiverFormData } from '../types/domain.js'

// Minimal valid 1x1 transparent PNG, base64-encoded.
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const dummyFormData: WaiverFormData = {
  fullName: 'Test Dummy',
  email: 'dummy@example.com',
  phone: '600000000',
  dni: '00000000A',
  dateOfBirth: '2000-01-01',
  address: 'Calle Falsa 123',
  province: 'Madrid',
  emergencyContactName: 'Contacto Emergencia',
  emergencyContactPhone: '600000001',
  emergencyContactRelationship: 'Familiar',
  sportsLicenseNumber: 'LIC-123',
  healthDeclaration: { no_conditions: true, understands_risk: true },
  consents: { data_processing: true, marketing: false },
}

let allPass = true

for (const documentType of ['WAIVER', 'RGPD'] as const) {
  try {
    const pdfBase64 = await generateWaiverPdf(documentType, dummyFormData, TINY_PNG_DATA_URL, 'Test Dummy')
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    const header = pdfBuffer.subarray(0, 4).toString('utf8')

    console.log(`\n=== Waiver PDF server-side generation check (${documentType}) ===`)
    console.log(`  base64 length: ${pdfBase64.length}`)
    console.log(`  header bytes:  ${JSON.stringify(header)}`)

    if (header === '%PDF') {
      console.log(`  PASS: ${documentType} PDF generated in Node with a valid PDF header\n`)
    } else {
      console.error(`  FAIL: ${documentType} PDF header is not '%PDF'\n`)
      allPass = false
    }
  } catch (err) {
    console.error(`\n=== Waiver PDF server-side generation check (${documentType}) ===`)
    console.error(`  FAIL: generateWaiverPdf threw: ${(err as Error).message}\n`)
    allPass = false
  }
}

if (!allPass) {
  process.exitCode = 1
}
