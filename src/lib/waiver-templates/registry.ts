import type { WaiverDocumentType } from '../../types/domain'
import { WAIVER_TITLE, WAIVER_LEGAL_TEXT, HEALTH_ITEMS, WAIVER_FIELDS } from './waiver'
import { RGPD_TITLE, RGPD_LEGAL_TEXT, CONSENT_ITEMS, RGPD_FIELDS } from './rgpd'
import { SOCIO_TITLE, SOCIO_LEGAL_TEXT, SOCIO_AUTHORISATIONS, SOCIO_FIELDS } from './socio'

/**
 * Single source of truth for what each legal document is made of.
 *
 * Before this existed, both the PDF generator and the signing form picked their
 * content with `documentType === 'WAIVER' ? waiverThing : rgpdThing`. That shape
 * only ever works for exactly two documents: a third type falls into the `else`
 * and silently renders the RGPD text, under the RGPD rules — a client signing a
 * legal document that isn't the one they were shown. Adding a document now means
 * adding one entry here; nothing downstream branches on the type any more.
 */

export type TemplateField = {
  readonly key: string
  readonly label: string
  /** 'text' | 'date' | 'tel' | 'email' | 'select' */
  readonly type: string
  readonly required: boolean
  /** Required when type is 'select'; ignored otherwise. */
  readonly options?: readonly { readonly value: string; readonly label: string }[]
}

export type TemplateCheckbox = {
  readonly key: string
  readonly label: string
  readonly required: boolean
  /** Optional second line under the label, on the signing page only. */
  readonly description?: string
}

export type TemplateCheckboxGroup = {
  /** Heading shown above the group, in both the form and the PDF. */
  readonly sectionTitle: string
  /** Optional line of guidance under the heading, on the signing page only. */
  readonly intro?: string
  /** Which WaiverFormData field the answers are stored under. */
  readonly field: 'healthDeclaration' | 'consents'
  /**
   * True when every item must be ticked to submit. Also drives presentation,
   * which is why the two existing documents look different: an all-required
   * group marks unticked items in red and reports one error for the group
   * (nothing is gained by printing "(obligatorio)" on every line), while a
   * mixed group labels each item and reports errors per item.
   */
  readonly allRequired: boolean
  readonly items: readonly TemplateCheckbox[]
}

export type WaiverTemplate = {
  /** Title on the PDF header and at the top of the signing page. */
  readonly title: string
  /** Short name for the staff UI, next to the QR button. */
  readonly staffLabel: string
  readonly legalText: string
  readonly fields: readonly TemplateField[]
  readonly checkboxes: TemplateCheckboxGroup | null
  /** Requires a witness (name, DNI, age and their own drawn signature). */
  readonly witness: boolean
  /**
   * Whether signing this one flips participants.waiver_signed — the flag the
   * operational screens read to allow boarding. Only the liability waiver does.
   */
  readonly marksParticipantSigned: boolean
}

// The health declaration is stored as a plain label map and every item is
// mandatory, so it normalises to an all-required group.
const HEALTH_CHECKBOXES: readonly TemplateCheckbox[] = Object.entries(HEALTH_ITEMS).map(
  ([key, label]) => ({ key, label, required: true })
)

const CONSENT_CHECKBOXES: readonly TemplateCheckbox[] = CONSENT_ITEMS.map(
  ({ key, label, required, description }) => ({ key, label, required, description })
)

export const WAIVER_TEMPLATES: Record<WaiverDocumentType, WaiverTemplate> = {
  WAIVER: {
    title: WAIVER_TITLE,
    staffLabel: 'Exención de responsabilidad',
    legalText: WAIVER_LEGAL_TEXT,
    fields: WAIVER_FIELDS,
    checkboxes: {
      sectionTitle: 'DECLARACIONES DE SEGURIDAD',
      intro: 'Confirma que comprendes y aceptas cada uno de los siguientes puntos:',
      field: 'healthDeclaration',
      allRequired: true,
      items: HEALTH_CHECKBOXES,
    },
    witness: false,
    marksParticipantSigned: true,
  },
  RGPD: {
    title: RGPD_TITLE,
    staffLabel: 'Consentimiento informado',
    legalText: RGPD_LEGAL_TEXT,
    fields: RGPD_FIELDS,
    checkboxes: {
      sectionTitle: 'CONSENTIMIENTOS',
      field: 'consents',
      allRequired: false,
      items: CONSENT_CHECKBOXES,
    },
    witness: true,
    marksParticipantSigned: false,
  },
  SOCIO: {
    title: SOCIO_TITLE,
    staffLabel: 'Ficha de socio',
    legalText: SOCIO_LEGAL_TEXT,
    fields: SOCIO_FIELDS,
    checkboxes: {
      sectionTitle: 'AUTORIZACIONES Y ACEPTACIÓN DE NORMATIVAS',
      intro:
        'Marca las autorizaciones que concedes. Una casilla marcada equivale al "Sí" del formulario en papel.',
      field: 'consents',
      allRequired: false,
      items: SOCIO_AUTHORISATIONS.map(({ key, label, required, description }) => ({
        key,
        label,
        required,
        description,
      })),
    },
    witness: false,
    // Club membership is required paperwork but it doesn't gate boarding —
    // only the liability waiver does.
    marksParticipantSigned: false,
  },
}

/** Every document type, in the order staff see them on a participant's card. */
export const WAIVER_DOCUMENT_TYPES = Object.keys(WAIVER_TEMPLATES) as WaiverDocumentType[]

export function getWaiverTemplate(documentType: WaiverDocumentType): WaiverTemplate {
  const template = WAIVER_TEMPLATES[documentType]
  if (!template) {
    // Unreachable through the UI (the column is CHECK-constrained), but a row
    // written by hand with an unknown type must not fall back to some other
    // document's text.
    throw new Error(`Unknown waiver document type: ${documentType}`)
  }
  return template
}
