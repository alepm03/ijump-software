// ─────────────────────────────────────────────────────────────────────────────
// WAIVER TEMPLATE — Exención de responsabilidad
//
// Para sustituir por el documento real:
//   1. Edita LEGAL_TEXT con el texto oficial.
//   2. Ajusta HEALTH_ITEMS si el checklist médico cambia.
//   3. El resto del flujo (firma, PDF, guardado) funciona sin tocar nada más.
// ─────────────────────────────────────────────────────────────────────────────

export const WAIVER_TITLE = 'Declaración de Riesgo y Exención de Responsabilidad'

export const WAIVER_LEGAL_TEXT = `
[DOCUMENTO DE PRUEBA — Sustituir por texto legal oficial]

Yo, el/la abajo firmante, declaro que he sido informado/a de los riesgos
inherentes a la práctica del paracaidismo tándem y acepto voluntariamente
participar en la actividad organizada por iJump.

Reconozco que el paracaidismo es una actividad deportiva que conlleva riesgos,
incluyendo la posibilidad de lesiones graves o muerte, y que dichos riesgos no
pueden ser eliminados por completo aunque se adopten todas las medidas de
seguridad razonables.

Por la presente, en pleno uso de mis facultades mentales, exonero a iJump, sus
empleados, instructores y colaboradores de cualquier responsabilidad por daños
personales, muerte o pérdida de bienes que pudieran producirse durante mi
participación en la actividad.

Esta declaración está firmada de forma libre y voluntaria, con pleno
conocimiento de su contenido y alcance legal.
`.trim()

// Checklist de condiciones de salud. Añadir o eliminar items según necesidad.
// La clave es el identificador técnico; el valor es el texto que ve el cliente.
export const HEALTH_ITEMS: Record<string, string> = {
  cardiac:           'No padezco enfermedades cardíacas ni hipertensión no controlada',
  epilepsy:          'No padezco epilepsia ni convulsiones',
  back:              'No tengo lesiones de espalda o cuello que contraindiquen la actividad',
  surgery_recent:    'No he sido operado/a en los últimos 6 meses',
  pregnancy:         'No estoy embarazada',
  alcohol_drugs:     'No he consumido alcohol ni sustancias en las últimas 12 horas',
  mental_health:     'No padezco ninguna condición psiquiátrica que contraindique la actividad',
  weight:            'Mi peso está dentro de los límites establecidos por el centro',
}

// Campos del formulario que el cliente debe rellenar (además de la firma).
// Orden de aparición en la página de firma.
export const WAIVER_FIELDS = [
  { key: 'fullName',              label: 'Nombre completo',           type: 'text',  required: true  },
  { key: 'dni',                   label: 'DNI / Pasaporte',           type: 'text',  required: true  },
  { key: 'dateOfBirth',           label: 'Fecha de nacimiento',       type: 'date',  required: true  },
  { key: 'address',               label: 'Dirección',                 type: 'text',  required: false },
  { key: 'phone',                 label: 'Teléfono',                  type: 'tel',   required: true  },
  { key: 'email',                 label: 'Email',                     type: 'email', required: true  },
  { key: 'emergencyContactName',  label: 'Contacto de emergencia',    type: 'text',  required: true  },
  { key: 'emergencyContactPhone', label: 'Teléfono de emergencia',    type: 'tel',   required: true  },
] as const
