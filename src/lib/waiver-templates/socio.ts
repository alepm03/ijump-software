export const SOCIO_TITLE =
  'Ficha de Adhesión de Nuevo Socio · Club Deportivo Piratas Club de Esquí & Skydive Puravida'

// Transcribed verbatim from the paper form. The club's contact address replaces
// the "[email del club]" placeholder the printed version still carries, since a
// data-protection clause has to name a real address for rights to be exercised.
export const SOCIO_LEGAL_TEXT = `
FICHA DE ADHESIÓN DE NUEVO SOCIO
Club Deportivo Piratas Club de Esquí & Skydive Puravida

CLÁUSULAS ADICIONALES

1. Protección de Datos: De conformidad con lo dispuesto en la Ley Orgánica 3/2018 de Protección de Datos Personales y Garantía de los Derechos Digitales, le informamos que sus datos serán tratados con el fin de gestionar su vinculación con el club. Podrá ejercer sus derechos de acceso, rectificación, cancelación y oposición enviando un correo a ijumpskydivepuravida@gmail.com.

2. Política de Pagos: El pago de la cuota de socio se realizará de acuerdo con las normativas establecidas por el club. La falta de pago en los plazos indicados podrá suponer la suspensión temporal o definitiva como socio.
`.trim()

// The three numbered authorisations. On paper each is a Sí/No pair; digitally a
// ticked box is the "Sí" and an unticked one the "No", the same convention the
// RGPD consents already use.
export const SOCIO_AUTHORISATIONS: Array<{
  key: string
  label: string
  description: string
  required: boolean
}> = [
  {
    key: 'admin_data_use',
    label: 'Autorizo el uso de mis datos personales para los fines administrativos del club',
    description:
      'Incluye el envío de información relacionada con las actividades del club. Necesario para tramitar tu alta como socio.',
    required: true,
  },
  {
    key: 'image_rights',
    label: 'Autorizo el uso de mi imagen en actividades deportivas, eventos y publicaciones',
    description:
      'En las redes sociales o página web del club. Puedes darte de alta como socio sin aceptar esta autorización.',
    required: false,
  },
  {
    key: 'club_rules',
    label: 'Acepto las normativas y reglamento del Club Deportivo',
    description:
      'Me comprometo a respetarlas y a seguir las directrices establecidas.',
    required: true,
  },
]

// Membership tiers exactly as printed. The fee shown is informative: it is
// already included in the tandem price and is never charged separately here.
export const SOCIO_CATEGORIES = [
  { value: 'ADULTO', label: 'Adulto — 179€' },
  { value: 'JOVEN', label: 'Joven, hasta 18 años — 150€' },
  { value: 'OTRO', label: 'Otro' },
] as const

export const SOCIO_FIELDS = [
  { key: 'fullName',                     label: 'Nombre completo',          type: 'text',   required: true  },
  { key: 'dateOfBirth',                  label: 'Fecha de nacimiento',      type: 'date',   required: true  },
  { key: 'dni',                          label: 'DNI / Pasaporte',          type: 'text',   required: true  },
  { key: 'address',                      label: 'Domicilio',                type: 'text',   required: true  },
  { key: 'postalCode',                   label: 'Código postal',            type: 'text',   required: true  },
  { key: 'city',                         label: 'Ciudad',                   type: 'text',   required: true  },
  { key: 'province',                     label: 'Provincia',                type: 'text',   required: true  },
  { key: 'phone',                        label: 'Teléfono',                 type: 'tel',    required: true  },
  { key: 'email',                        label: 'Correo electrónico',       type: 'email',  required: true  },
  { key: 'emergencyContactName',         label: 'Contacto de emergencia',   type: 'text',   required: true  },
  { key: 'emergencyContactRelationship', label: 'Relación',                 type: 'text',   required: true  },
  { key: 'emergencyContactPhone',        label: 'Teléfono de emergencia',   type: 'tel',    required: true  },
  { key: 'memberCategory',               label: 'Tipo de socio',            type: 'select', required: true,
    options: SOCIO_CATEGORIES },
  { key: 'memberCategoryOther',          label: 'Otro (especificar)',       type: 'text',   required: false },
] as const
