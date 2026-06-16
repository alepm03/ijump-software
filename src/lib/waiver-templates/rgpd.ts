export const RGPD_TITLE = 'Consentimiento Informado para la Práctica de Paracaidismo Deportivo'

export const RGPD_LEGAL_TEXT = `
C.D. I JUMP SKYDIVE PURA VIDA — CIF G-23600968
Aeródromo de Casas de los Pinos. N-301, Km 190, carretera de los Higuerones s/n. 16612 (Cuenca)

MANIFIESTA: que consecuencia de mi petición he sido invitado por C.D. I JUMP SKYDIVE PURA VIDA a realizar un vuelo de divulgación/paseo o saltos de paracaidismo, tándem, en la aeronave a lo largo todo el año actual. El salto tándem es el primer salto de bautismo como socio.

Que ante la eventualidad de un accidente durante el tiempo que dure la realización del vuelo y maniobras directamente relacionadas con el mismo, sabiendo que la práctica del Paracaidismo es un deporte de alto riesgo:

DECLARO: expresa y libremente, en el pleno ejercicio de mis facultades, tanto físicas como mentales, que HE SIDO INFORMADO y reconozco mi deseo de realizar saltos de paracaidismo/vuelo deportivo desde avión, organizado por el club por lo que renuncio de forma voluntaria al derecho de solicitar, mediante el ejercicio de acción personal, ante todos los instructores, pilotos de aeronave y directivos de este centro de paracaidismo, cualquier tipo de indemnización que pueda resultar procedente, siempre que dicha renuncia no contravenga lo establecido en el apartado 2 del artículo 6º del vigente Código Civil (*), por cualquier posible daño que pueda derivarse de la realización de ambos deportes.

No se entenderá en modo alguno comprendida en dicha renuncia, el ejercicio de aquellos derechos derivados de la ejecución de las pólizas de seguros, individuales o colectivos, de cualquier tipo que puedan tener suscritas el piloto, propietarios de la aeronave, así como el club organizador y sus correspondientes directivos e instructores.

Asimismo asumo personalmente los daños que yo mismo pudiera causar a terceros reconociendo haber recibido la enseñanza del reglamento básico de paracaidismo por parte de este club, establecido por la Real Federación Aeronáutica Española.

DECLARO: Haber recibido las clases teóricas y prácticas para la realización del curso de paracaidismo deportivo por un instructor cualificado habiendo obtenido la calificación de APTO/A según el Reglamento Básico de Paracaidismo editado por la Real Federación Aeronáutica Española.

Asimismo, DECLARO haber recibido las instrucciones oportunas de las posibles emergencias que se pudieran originar en el salto con paracaídas y haber recibido clases del manejo de campana, así como la toma de tierra asistida o no asistida. También DECLARO estar informado de la cobertura en caso de accidente por negligencia en el salto, así como tener cobertura sanitaria propia, pública o privada, para el caso de necesidad de atención sanitaria.

He sido informado de la prohibición de la práctica de submarinismo deportivo 24 horas antes del salto, y que respetaré mi descanso personal no habiendo trasnochado la noche anterior a la práctica de este deporte.

Artículo 6.2 Código Civil*: La exclusión voluntaria de la Ley aplicable y la renuncia de los derechos en ella reconocidos solo serán válidas cuando no contraríen el interés o el orden público ni perjudique a tercero.
`.trim()

export const CONSENT_ITEMS: Array<{
  key: string
  label: string
  description: string
  required: boolean
}> = [
  {
    key: 'liabilityWaiver',
    label: 'Renuncia voluntaria a indemnización',
    description:
      'Renuncio de forma voluntaria al derecho de solicitar cualquier tipo de indemnización a todos los instructores, pilotos de aeronave y directivos de este centro de paracaidismo, por cualquier posible daño que pueda derivarse de la realización de esta actividad.',
    required: true,
  },
  {
    key: 'imageRightsConsent',
    label: 'Derechos de imagen',
    description:
      'Autorizo la utilización de mi grabación o fotografías tomadas a mi persona con fines publicitarios para este centro, no pudiendo éste realizar mal uso de las mismas.',
    required: false,
  },
  {
    key: 'medicalConsent',
    label: 'Consentimiento médico',
    description:
      'Doy el consentimiento a los centros hospitalarios para, en el caso de accidente y si así lo precisara, realizar cuantas transfusiones sanguíneas sean necesarias y requeridas.',
    required: true,
  },
  {
    key: 'sobrietyDeclaration',
    label: 'Declaración de sobriedad',
    description:
      'Declaro no haber ingerido alcohol ni ningún tipo de estupefacientes, barbitúricos o fármacos que pudieran ocasionar somnolencia o distrofia muscular en las 24 horas previas al salto, y he respetado mi descanso personal no habiendo trasnochado la noche anterior.',
    required: true,
  },
]

export const RGPD_FIELDS = [
  { key: 'fullName',                     label: 'Nombre completo',          type: 'text',  required: true  },
  { key: 'dateOfBirth',                  label: 'Fecha de nacimiento',      type: 'date',  required: true  },
  { key: 'dni',                          label: 'DNI / Pasaporte',          type: 'text',  required: true  },
  { key: 'address',                      label: 'Domicilio',                type: 'text',  required: true  },
  { key: 'province',                     label: 'Provincia',                type: 'text',  required: true  },
  { key: 'phone',                        label: 'Teléfono',                 type: 'tel',   required: true  },
  { key: 'email',                        label: 'Email',                    type: 'email', required: true  },
  { key: 'sportsLicenseNumber',          label: 'Nº licencia deportiva',    type: 'text',  required: false },
  { key: 'emergencyContactName',         label: 'Contacto de emergencia',   type: 'text',  required: true  },
  { key: 'emergencyContactRelationship', label: 'Parentesco',               type: 'text',  required: true  },
  { key: 'emergencyContactPhone',        label: 'Teléfono de emergencia',   type: 'tel',   required: true  },
] as const
