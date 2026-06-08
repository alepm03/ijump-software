// ─────────────────────────────────────────────────────────────────────────────
// RGPD TEMPLATE — Consentimiento de protección de datos
//
// Para sustituir por el documento real:
//   1. Edita RGPD_LEGAL_TEXT con el texto oficial.
//   2. Ajusta CONSENT_ITEMS si los consentimientos cambian.
//   3. El resto del flujo funciona sin tocar nada más.
// ─────────────────────────────────────────────────────────────────────────────

export const RGPD_TITLE = 'Consentimiento de Protección de Datos (RGPD)'

export const RGPD_LEGAL_TEXT = `
[DOCUMENTO DE PRUEBA — Sustituir por texto legal oficial]

En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018
de Protección de Datos Personales (LOPDGDD), iJump le informa:

RESPONSABLE: iJump · [Dirección] · [CIF] · [Email de contacto]

FINALIDAD: Gestión de su participación en actividades de paracaidismo tándem,
emisión de documentación, y comunicaciones relacionadas con el servicio.

LEGITIMACIÓN: Consentimiento del interesado y ejecución de contrato.

DESTINATARIOS: No se cederán datos a terceros salvo obligación legal.

DERECHOS: Puede ejercer sus derechos de acceso, rectificación, supresión,
portabilidad y oposición dirigiéndose a [email].

PLAZO DE CONSERVACIÓN: Los datos se conservarán durante el tiempo necesario
para la prestación del servicio y el cumplimiento de obligaciones legales.
`.trim()

// Checkboxes de consentimiento. El campo `required` indica si bloquea el envío.
export const CONSENT_ITEMS: Array<{
  key: 'dataProcessingConsent' | 'imageRightsConsent' | 'marketingConsent'
  label: string
  description: string
  required: boolean
}> = [
  {
    key: 'dataProcessingConsent',
    label: 'Tratamiento de datos personales',
    description:
      'Consiento el tratamiento de mis datos personales para la gestión del servicio contratado.',
    required: true,
  },
  {
    key: 'imageRightsConsent',
    label: 'Derechos de imagen',
    description:
      'Autorizo a iJump a utilizar fotografías y vídeos de mi salto con fines promocionales y en redes sociales.',
    required: false,
  },
  {
    key: 'marketingConsent',
    label: 'Comunicaciones comerciales',
    description:
      'Acepto recibir comunicaciones sobre ofertas, promociones y novedades de iJump.',
    required: false,
  },
]

// Campos del formulario (pre-rellenados desde el participante si existen).
export const RGPD_FIELDS = [
  { key: 'fullName', label: 'Nombre completo', type: 'text',  required: true  },
  { key: 'email',    label: 'Email',            type: 'email', required: true  },
] as const
