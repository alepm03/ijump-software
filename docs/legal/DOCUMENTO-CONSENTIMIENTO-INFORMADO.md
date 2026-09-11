# DOCUMENTO DE CONSENTIMIENTO INFORMADO PARA LA PRÁCTICA DE PARACAIDISMO DEPORTIVO

I JUMP SKYDIVE PURA VIDA C.D. · CIF G-23600968
Aeródromo de Casas de los Pinos. N-301, Km 190, carretera de los Higuerones s/n. 16612 Casas de los Pinos (Cuenca)

> **Documento fuente.** La versión que el cliente firma realmente vive en
> `src/lib/waiver-templates/rgpd.ts` y se sirve por QR. Este fichero es el
> espejo en papel de esa versión. Actualizado el 2026-09-10 para colocar el
> "C.D." al final de la razón social. Si se edita uno de los dos, hay que
> editar el otro.

D. Dña. ____________________, nacido/a el día _______ de____________ de ______________, con DNI _________________, y domicilio en _________________________________, provincia de ________________, Calle_______________________________________________, con teléfono ______________________, e-mail ________________________________ y licencia deportiva clase (en su caso) _____________, número _______________.

MANIFIESTA: que consecuencia de mi petición he sido invitado por I JUMP SKYDIVE PURA VIDA C.D. a realizar un vuelo de divulgación/paseo o saltos de paracaidismo, tándem, en la aeronave a lo largo todo el año actual. El salto tándem es el primer salto de bautismo como socio.

Que ante la eventualidad de un accidente durante el tiempo que dure la realización del vuelo y maniobras directamente relacionadas con el mismo, sabiendo que la práctica del Paracaidismo es un deporte de alto riesgo:

DECLARO: expresa y libremente, en el pleno ejercicio de mis facultades, tanto físicas como mentales, que HE SIDO INFORMADO y reconozco mi deseo de realizar saltos de paracaidismo/vuelo deportivo desde avión, organizado por el club por lo que renuncio de forma voluntaria al derecho de solicitar, mediante el ejercicio de acción personal, ante todos los instructores, pilotos de aeronave y directivos de este centro de paracaidismo, cualquier tipo de indemnización que pueda resultar procedente, siempre que dicha renuncia no contravenga lo establecido en el apartado 2 del artículo 6º del vigente Código Civil (*), por cualquier posible daño que pueda derivarse de la realización de ambos deportes.

En cuanto a mis derechos de imagen, autorizo la utilización de mi grabación o fotografías tomadas a mi persona, con fines publicitarios para este centro, no pudiendo éste realizar mal uso de las mismas.

No se entenderá en modo alguno comprendida en dicha renuncia, el ejercicio de aquellos derechos derivados de la ejecución de las pólizas de seguros, individuales o colectivos, de cualquier tipo que puedan tener suscritas el piloto, propietarios de la aeronave, así como el club organizador y sus correspondientes directivos e instructores.

Así mismo asumo personalmente los daños que yo mismo pudiera causar a terceros reconociendo haber recibido la enseñanza del reglamento básico de paracaidismo por parte de este club, establecido por la Real Federación Aeronáutica Española.

Doy el consentimiento A LOS CENTROS HOSPITALARIOS para en el caso de accidente y si así lo precisara, realizar cuantas transfusiones sanguíneas sean necesarias y requeridas.

DECLARO: Haber recibido las clases teóricas y prácticas para la realización del curso de paracaidismo deportivo por un instructor cualificado habiendo obtenido la calificación de APTO/A según el Reglamento Básico de Paracaidismo editado por la Real Federación Aeronáutica Española.

Asimismo, DECLARO haber recibido las instrucciones oportunas de las posibles emergencias que se pudieran originar en el salto con paracaídas y haber recibido clases del manejo de campana, así como la toma de tierra asistida o no asistida. También DECLARO estar informado de la cobertura en caso de accidente por negligencia en el salto, así como tener cobertura sanitaria propia, pública o privada, para el caso de necesidad de atención sanitaria.

DECLARO no haber ingerido alcohol ni ningún tipo de estupefacientes, barbitúricos o fármacos que pudieran ocasionar somnolencia o distrofia muscular en las 24 horas antes del salto.

He sido informado de la prohibición de la práctica de submarinismo deportivo 24 horas antes del salto, y que respetado mi descanso personal no habiendo trasnochado la noche anterior a la práctica de este deporte.

En caso de accidente avisar a _______________ parentesco __________________ teléfono_______________________.

Y para que así conste firmo el presente documento, junto al testigo firmante.

En Cuenca, a ____________, de __________, de ____________

FIRMADO

Testigo

Nombre:
DNI:
Edad:
Firma:

Menores de edad reconocimiento de firma del padre o tutor (Banco o Notario) o presentes.

VALIDEZ DE UN AÑO ENHORABUENA YA ERES SOCIO DEL CLUB (COLABORADOR)

Artículo 6.2 Código Civil*: La exclusión voluntaria de la Ley aplicable y la renuncia de los derechos en ella reconocidos solo serán válidas cuando no contraríen el interés o el orden público ni perjudique a tercero.

---

## Divergencias entre este papel y lo que se firma digitalmente

### Resueltas (2026-09-11)

1. **Testigo firmante.** El papel original exigía dos. Decisión de Ricardo:
   **un solo testigo**, no dos. En la práctica suele ser alguien conocido del
   propio grupo del participante; en su defecto firma Ana (administración).
   Implementado en el flujo digital: nombre, DNI, edad y firma capturada con
   el mismo lienzo de firma que ya existe para el participante — sin añadir
   ninguna tabla ni columna nueva a la base de datos, la firma viaja dentro
   de `form_data` (JSONB), igual que el resto de campos del formulario. El
   PDF generado incluye una sección "TESTIGO" con estos datos.
2. **"Validez de un año" y el alta como socio colaborador.** Reincorporada a
   `rgpd.ts`, tal cual el original, sin retocar puntuación. Confirmado por
   Ricardo el 2026-09-10: **el alta de socio no conlleva cuota**.

### Pendiente

3. **Reconocimiento de firma del padre o tutor para menores** (banco o
   notario, o presencia física). Confirmado por Ricardo el 2026-09-11: **ya
   está cubierto en pista** como protocolo operativo, no como un paso del
   software. Queda pendiente **digitalizarlo, si es posible y legal** —
   no se ha tocado código para esto.

El resto del contenido sí está cubierto: los datos identificativos y el
contacto de emergencia se recogen como campos del formulario
(`WAIVER_FIELDS`), y los derechos de imagen, el consentimiento médico y la
declaración de sobriedad son casillas independientes (`CONSENT_ITEMS`).
