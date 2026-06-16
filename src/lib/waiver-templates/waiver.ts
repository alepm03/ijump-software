export const WAIVER_TITLE = 'Términos y Condiciones — I Jump Skydive Puravida'

export const WAIVER_LEGAL_TEXT = `
DOCUMENTO DE COMPRENSIÓN Y CONSENTIMIENTO DE ACTIVIDAD TANDEM
I JUMP SKYDIVE PURAVIDA

Por favor, indique que USTED ENTIENDE Y ACEPTA lo siguiente y que ha recibido este documento informativo con anterioridad a efectuar la reserva de la actividad:

• Los depósitos no son reembolsables. Las reservas son válidas por 6 meses desde la compra. En caso de imposibilidad de salto en la fecha programada por cuestiones meteorológicas u otras que, a criterio de I Jump Skydive Puravida, pongan o puedan poner en peligro la integridad del alumno y/o el instructor, se procederá a la reprogramación del salto en otra fecha posterior pero no será motivo en ningún caso de devolución de la cantidad previamente abonada.

• Los alumnos deben tener al menos 18 años el día del salto (14 con consentimiento del/los tutores, según ley).

• El peso máximo es de 110kg. El peso debe medirse con ropa, zapatos y totalmente equipado (mono y arnés). Si excede de 90kg. en las condiciones anteriormente señaladas, debe usar un equipo diferente que incurre en un cargo adicional de 45€.

• Todos los alumnos tándem están sujetos a una evaluación física independientemente de su peso.

• Los participantes entienden que la actividad puede tomar de 3 a 5 horas, dependiendo del clima u otras eventuales circunstancias.

• Estar en condiciones físicas oportunas para el ejercicio de la actividad. Si tiene dudas sobre sus condiciones médicas, consulte con un facultativo previamente.

• Se permite la reprogramación con más de 72 horas de aviso sin costo adicional. Menos de 72 horas no podrá reprogramarse y se perderá, en este caso, la totalidad de la cantidad entregada.

• Los saltos reprogramados por parte del alumno, sin importar la razón, estarán sujetos al precio aplicable ese día.

• El alumno no podrá hacer uso de cámaras u otros dispositivos para realizar videos o cualquier contenido multimedia. Está prohibido el uso de relojes y objetos que no puedan garantizar la seguridad de la actividad en su totalidad.

• Al hacer una reserva, los alumnos están aceptando los presentes Términos y Condiciones.

• Tenga en cuenta que el paquete del video lo conservaremos durante 15 días desde el día de su salto. Por lo tanto, recomendamos que descargue los archivos a su dispositivo/nube tan pronto como los reciba por correo electrónico.

• Los precios promocionales son válidos para los saltos en tándem completados durante el período de promoción, sin importar la fecha en que se haga la reserva. Las promociones no pueden combinarse ni mezclarse con otros descuentos.

• Entiendo que I Jump Skydive Puravida está ubicado en el aeródromo de Casas de los Pinos en el Centro Internacional de Paracaidismo Aero Balas, S.L., cerca de La Roda en el sur de Castilla la Mancha, N-301, km 190.
`.trim()

export const HEALTH_ITEMS: Record<string, string> = {
  injury_risk:       'Soy consciente de que el paracaidismo es un deporte potencialmente peligroso y puede causar lesiones o la muerte.',
  body_contact:      'Soy consciente de que para realizar un salto tándem es necesario un contacto corporal muy cercano con mi instructor durante la mayor parte de la experiencia, incluyendo ser solicitado para sentarme en sus piernas cuando esté en la aeronave, para ajustar el arnés.',
  aircraft_emergency:'Seguiré cualquier instrucción dada por mi instructor en caso de emergencia en la aeronave.',
  briefing:          'He recibido por parte de un instructor las directrices (briefing) informativas sobre el salto en tándem antes de proceder a realizarlo.',
  body_position:     'Estoy familiarizado/a con la posición del cuerpo antes del salto (cabeza hacia atrás, piernas juntas, arqueo, manos en el arnés).',
  freefall:          'Entiendo los procedimientos de salida y soy consciente de la importancia de una buena posición del cuerpo arqueada para una salida exitosa. No agarraré ninguna parte del instructor en ningún momento.',
  canopy:            'NO alcanzaré las áreas del equipo a menos que se me indique lo contrario y seguiré las órdenes del instructor en todo momento. Informaré al instructor si me siento mal en cualquier momento.',
  landing:           'Soy consciente de la importancia de la posición correcta de aterrizaje (de pie/sentado deslizándose). MANTENDRÉ las piernas ALTAS para el aterrizaje.',
}

export const WAIVER_FIELDS = [
  { key: 'fullName',              label: 'Nombre completo',        type: 'text',  required: true  },
  { key: 'dni',                   label: 'DNI / Pasaporte',        type: 'text',  required: true  },
  { key: 'dateOfBirth',           label: 'Fecha de nacimiento',    type: 'date',  required: true  },
  { key: 'address',               label: 'Dirección',              type: 'text',  required: false },
  { key: 'phone',                 label: 'Teléfono',               type: 'tel',   required: true  },
  { key: 'email',                 label: 'Email',                  type: 'email', required: true  },
  { key: 'emergencyContactName',  label: 'Contacto de emergencia', type: 'text',  required: true  },
  { key: 'emergencyContactPhone', label: 'Teléfono de emergencia', type: 'tel',   required: true  },
] as const
