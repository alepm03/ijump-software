# Nota de contexto para la revisión legal

**Para:** revisión de un abogado (padre de Ricardo Pichardo)
**De:** Ricardo Pichardo / Edrai Solutions, para I Jump Skydive Pura Vida C.D.
**Fecha:** 2026-09-09
**Sobre:** dos documentos nuevos, extraídos y separados del documento actual de "Términos y Condiciones"

## Qué es esto y qué no es

Estos dos documentos **no son contenido legal nuevo inventado**. Son una
extracción fiel del documento único que I Jump usa hoy
(`docs/legal/TERMINOS-Y-CONDICIONES.md`, implementado en el software en
`src/lib/waiver-templates/waiver.ts`), separado en dos partes según su
naturaleza, más dos correcciones puntuales y una adición señalada abajo.

**Por qué se separa en dos:** el documento actual mezcla dos cosas que no
pueden aceptarse en el mismo momento sin incurrir en una contradicción:

- Condiciones **comerciales** (depósito, cancelación, peso, precios): deben
  poder conocerse **antes de pagar**, no solo el día del salto.
- Comprensión del **briefing de seguridad** (postura, salida, aterrizaje...):
  solo tiene sentido **después** de que el instructor lo haya explicado en
  pista. No se puede firmar antes sin mentir ("he recibido el briefing" cuando
  aún no ha ocurrido).

El documento actual pide aceptar ambas cosas a la vez, el día del salto, y
además se autodeclara entregado "con anterioridad a efectuar la reserva",
lo cual hoy no es cierto. Ese es el problema de fondo, no el importe en juego.

## Decisión de negocio de Ricardo, para que quede constante en la revisión

Ricardo ha revisado el análisis de riesgo y confirma que **el depósito de
reserva se paga antes de leer las condiciones, pero el grueso del precio (la
liquidación, aproximadamente el 70% del importe total) se paga el mismo día
de la actividad**, en el momento en que también se firma este documento.
Además, en la práctica ningún cliente ha renunciado a saltar tras leer las
condiciones en pista, y la empresa asume que un cliente no va a litigar por
el importe del depósito.

Es una valoración de riesgo razonable para el escenario de una reclamación
civil individual por el depósito, y así se traslada aquí. **No se ha
reescrito nada para forzar la afirmación de que el cliente acepta las
condiciones comerciales antes de reservar**, porque hoy eso no es cierto y no
se quiere repetir el mismo error (una declaración del documento que no se
sostiene). El documento 2 de abajo está redactado para ser **verdadero tal
y como funciona el proceso hoy**, sin necesidad de tocar la web.

Sigue habiendo, con independencia del importe del depósito, dos motivos por
los que se recomienda esta corrección aunque sea de bajo coste y sin prisa:

1. Una **denuncia administrativa** ante Consumo (OMIC, Junta Arbitral de
   Consumo autonómica) es gratuita, no exige abogado ni que compense
   económicamente reclamar, y no depende de si el cliente quiere o no
   recuperar el depósito. Basta un cliente molesto.
2. Las dos frases que el documento actual se autoatribuye ("recibido con
   anterioridad a la reserva", "al reservar ya se aceptan") son gratis de
   quitar y, si algún día hay una reclamación por lesión de verdad (donde sí
   hay mucho dinero en juego), esa contradicción se puede usar para atacar la
   validez de todo el documento, no solo la cláusula del depósito.

Con esto la corrección deja de ser "arreglar algo urgente" y pasa a ser
"quitar una frase gratuita que no ayuda, ahora que ya se está tocando el
documento por otro motivo (nombre y CIF)".

## Los dos documentos

- **`02_CONDICIONES_COMERCIALES_BORRADOR.md`** — el bloque comercial del
  documento actual, sin las dos frases autodeclaratorias. Pensado para poder
  publicarse en la web en el futuro si algún día se decide, pero también
  válido tal cual para seguir usándose solo en pista, junto al documento 3,
  como se hace hoy.
- **`03_COMPRENSION_BRIEFING_SEGURIDAD_BORRADOR.md`** — la comprensión del
  briefing operativo de seguridad (postura, salida, caída libre, campana,
  aterrizaje), que sí debe firmarse en pista, después del briefing, tal como
  ya ocurre hoy.

El tercer documento, el **consentimiento informado** (renuncia de
responsabilidad, aptitud médica, alta de socio, derechos de imagen,
declaración de sobriedad), **no se toca**: ya existe en
`docs/legal/DOCUMENTO-CONSENTIMIENTO-INFORMADO.md` y no formaba parte del
documento mezclado que se está separando aquí.

## Puntos abiertos para el abogado, señalados dentro de los documentos

1. **Edad mínima de menores.** El documento actual dice "14 años con
   consentimiento de los tutores, según ley". No se ha localizado ninguna
   norma española que fije esa edad para paracaidismo (el resto del sector
   consultado usa 16-18 años). Se ha dejado como campo pendiente en el
   documento 2 en vez de decidir una cifra sin verificarla.
2. **Alta como socio del club.** El documento de consentimiento informado ya
   dice hoy que el salto es "el primer salto de bautismo como socio" y que al
   final "ya eres socio del club (colaborador)". El documento 2 nuevo se
   limita a avisar de esa condición antes del día del salto, sin inventar
   detalles sobre cuota o licencia federativa que no se conocen. Si el alta
   de socio implica algo con efecto sobre el cliente (cuota, cobertura de
   seguro distinta), convendría que quedara explícito; esa respuesta la tiene
   Raúl, no está en ningún documento revisado hasta ahora.
3. **Fuero y legislación aplicable.** No se ha redactado una cláusula de
   jurisdicción en el documento 2 por no inventar el texto sin verificar que
   es conforme (en contratos de consumo no cabe pactar un fuero distinto al
   del domicilio del consumidor). Se deja en blanco a criterio del abogado.
4. **Importe del depósito (60 €).** Confirmado en la base de conocimiento
   operativa del negocio (fuente: Raúl, 2026-05-25) pero no verificado contra
   ningún documento contractual firmado. Se ha incluido entre corchetes para
   que se confirme antes de publicar.

## Una vez aprobado

Los cambios de redacción que el abogado apruebe se trasladan a
`src/lib/waiver-templates/waiver.ts` (que hoy ya separa internamente el texto
comercial de las casillas de comprensión de seguridad, `HEALTH_ITEMS`, aunque
las presenta juntas en el mismo momento) para que el código y el papel digan
lo mismo. No se ha tocado el código todavía: estos dos ficheros son
borrador de revisión.
