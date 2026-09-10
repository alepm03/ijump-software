# Benchmark legal — Sector paracaidismo en España

**Fecha:** 2026-09-09
**Autor:** Investigación asistida (Claude), a partir de búsqueda web y navegación de sitios públicos
**Objeto:** Evaluar si la arquitectura documental legal actual de I Jump Skydive (checkbox vacío en la web + dos documentos firmados el día del salto vía QR) es conforme a la normativa española de consumo y a la práctica del sector, y proponer una arquitectura recomendada.

## Nota metodológica y de rigor (leer antes que el resto)

- Toda afirmación de este informe está marcada como **[VERIFICADO]** (confirmado leyendo directamente una web o un texto legal citado más abajo), **[VERIFICADO — fuente secundaria]** (confirmado vía una base de datos jurídica que reproduce el texto legal, p. ej. Iberley, sin haber podido contrastar carácter literal exacto contra el BOE por fallo técnico de acceso — ver limitaciones) o **[INFERENCIA / CONOCIMIENTO GENERAL]** (razonamiento jurídico propio o práctica sectorial no confirmada documentalmente).
- **Limitación de acceso:** Los intentos de descargar el texto consolidado del TRLGDCU directamente desde boe.es fallaron repetidamente (fragmentos truncados, error de certificado SSL). El texto de los artículos 60, 97 y 103.l) que se cita procede de **Iberley** (base de datos jurídica privada que replica la legislación consolidada), contrastado por búsqueda cruzada con noticias.juridicas.com y con resúmenes doctrinales (ICA Cartagena, Redalyc). No se ha podido pegar aquí el texto tal y como aparece en el BOE carácter por carácter. Se recomienda que un abogado verifique la redacción exacta vigente en boe.es antes de usar este informe como base de una reforma contractual definitiva.
- **No se ha podido verificar el "Reglamento Básico de Paracaidismo" de la RFAE** en su versión vigente y completa: los PDFs localizados (aereamadrid.es, famur.org, fada.aero, skytime.es) o bien no cargaron con contenido legible, o bien no contenían las cláusulas de edad mínima buscadas. Por tanto, **no puedo confirmar el contenido exacto del reglamento federativo sobre menores**; lo que sigue sobre edad mínima procede de lo que los propios centros comerciales publican (no de la norma federativa en sí), y se marca así explícitamente.
- El "benchmark de centros" se basa en fetch directo de las páginas legales/de condiciones de cada centro cuando fue accesible, y en resultados de búsqueda (fragmentos indexados) cuando el fetch directo falló. Se indica en cada fila qué método se usó. No se ha navegado el flujo de reserva paso a paso de cada centro (formulario con checkbox) porque las herramientas de navegación interactiva (`/browse`) no estaban disponibles en esta sesión de investigación; el análisis del enlace del checkbox se basa en lo publicado en la propia web (existencia o no de página de condiciones enlazable), no en observación directa del atributo `href` del checkbox de cada formulario. Esto se marca como limitación en la tabla.
- No se reproduce texto literal con copyright de terceros; se resume estructura y contenido.

---

## 1. Separación de documentos: práctica del sector

**[VERIFICADO, con matices]** No existe un estándar único, pero el patrón dominante observado en los siete centros españoles investigados (sección 4) es una **separación en tres capas conceptualmente distintas**, aunque su implementación varía mucho en qué se publica y qué no:

1. **Aviso legal / condiciones de uso del sitio web** (LSSI-CE): identificación del titular, propiedad intelectual, uso del sitio, cookies, jurisdicción. Es genérico, no específico de la actividad de paracaidismo, y **casi siempre está publicado y enlazado en el pie de página** de la web (verificado en Skydive La Mancha, Skydive Requena, Skydive Empuriabrava, Skydive Barcelona). Este documento normalmente **no** contiene condiciones comerciales (depósito, cancelación) ni renuncia de responsabilidad.
2. **Condiciones comerciales de la actividad** (depósito, validez del bono, política de reprogramación, peso máximo, recargos): en algunos centros están **publicadas en una página separada y pública** (Skydive Spain/Sevilla, Skydive Córdoba, Skydive Empuriabrava según referencia a "Condiciones de Venta" separada del aviso legal), en otros **no se ha encontrado publicación pública** (Skydive La Mancha, Skydive Requena — su "Aviso Legal" es puramente LSSI, sin cláusula de depósito ni cancelación visible).
3. **Consentimiento informado / exención de responsabilidad para la práctica del salto**: en **ningún** centro investigado se ha encontrado este documento publicado íntegramente en la web pública. Es coherente con la práctica extendida (no verificable a distancia, pero consistente con lo que reportan foros de usuarios y con el propio modelo de I Jump) de que este documento **se firma físicamente en pista, el día del salto**, habitualmente junto con la comprobación médica/de aptitud, y a menudo por medios digitales (tablet/QR) dado que agiliza la operativa en pista.

**Conclusión de la pregunta 1 [INFERENCIA basada en el patrón observado]:** la separación entre (a) aviso legal web, (b) condiciones comerciales y (c) consentimiento informado/exención de responsabilidad **sí es la arquitectura típica del sector**, pero el patrón dominante no es "todo publicado en la web": lo único que casi todos publican de forma pública y accesible es el aviso legal LSSI. Las condiciones comerciales están publicadas en la web en aproximadamente la mitad de los centros revisados, y el consentimiento informado/waiver **prácticamente nunca está publicado en la web** — se reserva para el momento presencial. Esto significa que el modelo de I Jump (firma en pista de dos documentos combinados: condiciones comerciales + consentimiento informado) **no es atípico** en cuanto al *momento* de la firma del waiver de responsabilidad. Donde I Jump se desvía de las prácticas mejor documentadas del sector es en que **varios competidores sí publican las condiciones comerciales (depósito no reembolsable, política de cancelación) en la propia web, de forma pública y accesible desde el proceso de reserva**, mientras que I Jump las deja también para el día del salto, con el checkbox de la web sin enlace funcional.

Número de documentos firmados por el cliente: en el modelo típico son **2 firmas presenciales** (aptitud/consentimiento médico + exención de responsabilidad, a veces fusionados en un único documento) más, en algunos centros, una **aceptación online de condiciones comerciales en el momento de pagar el depósito** (no siempre visible ni verificable desde fuera).

---

## 2. Momento de aceptación de las condiciones comerciales: análisis legal

### 2.1 Marco normativo aplicable

**[VERIFICADO — fuente secundaria, Iberley]** El TRLGDCU (Real Decreto Legislativo 1/2007) regula, para todo contrato con consumidores celebrado a distancia (una reserva online es, por definición, contratación a distancia si se perfecciona por medios electrónicos sin presencia física simultánea):

- **Art. 60** — Información previa al contrato: el empresario debe facilitar, **de forma clara y comprensible, antes de que el consumidor quede vinculado**, información sobre las características principales del bien o servicio "en particular sobre sus condiciones jurídicas y económicas", precio total, procedimientos de pago y ejecución, duración del contrato y condiciones de resolución, y el derecho de desistimiento cuando exista. La carga de la prueba del cumplimiento de esta obligación **corresponde al empresario**.
- **Art. 97** — Información precontractual específica de contratos a distancia: repite y amplía lo anterior (identidad del empresario, precio total, procedimientos de pago/entrega, plazo de desistimiento si existe, garantías, duración del contrato, depósitos o garantías financieras exigidas —apartado r)—, etc.). Debe darse **antes de que el consumidor quede obligado**.
- **Art. 98** — Requisitos formales: la información del art. 97 debe entregarse en un soporte adecuado y, si hay obligación de pago, de forma "clara y destacada" justo antes de que el consumidor confirme el pedido.
- **Art. 103.l)** — Excepciones al derecho de desistimiento: el derecho general de desistimiento de 14 días **no aplica** al "suministro de servicios [...] relacionados con actividades de esparcimiento, si los contratos prevén una fecha o un periodo de ejecución específicos" — encaja con un salto tándem reservado para una fecha concreta.

### 2.2 Respuesta a la pregunta central

**[INFERENCIA / análisis jurídico propio, no jurisprudencia verificada sobre este supuesto exacto]**

La pregunta del brief mezcla dos regímenes distintos del TRLGDCU que conviene separar:

1. **El derecho de desistimiento (14 días para "arrepentirse" sin motivo)** — Aquí la excepción del art. 103.l) es clara y aplicable: un salto tándem con fecha reservada es un "servicio de esparcimiento con fecha de ejecución específica", así que el cliente **no tiene derecho legal a desistir sin causa** dentro de los 14 días tras la reserva, simplemente por haberlo pensado mejor. Hasta aquí, la cláusula de "depósito no reembolsable" **no es per se ilegal** por chocar con el desistimiento — el desistimiento no aplica a este tipo de servicio.

2. **La obligación de información precontractual (arts. 60, 97, 98)** — Esta es una obligación **completamente distinta e independiente** de la anterior, y **no tiene excepción para servicios de ocio**. Se aplica siempre que haya contratación a distancia con consumidores. El hecho de que el desistimiento no aplique **no exime** al empresario de informar, **antes de que el cliente pague el depósito**, de las condiciones económicas del servicio: que el depósito no es reembolsable, la política de reprogramación (72h), la validez del bono (6 meses), el peso máximo y el recargo por sobrepeso, etc. Todo esto son "condiciones jurídicas y económicas" del art. 60 y "depósitos o garantías financieras" del art. 97.1.r).

**Riesgo identificado:** Con el checkbox de la web actualmente **sin enlace funcional**, I Jump no está cumpliendo de forma verificable la obligación de información precontractual sobre estas condiciones económicas antes de que el cliente pague o reserve. Esto genera dos frentes de riesgo, distintos entre sí:

- **Riesgo de incumplimiento administrativo/de consumo**: la falta de información previa clara sobre condiciones económicas esenciales (depósito no reembolsable, plazos de reprogramación) es en sí misma una infracción de las obligaciones de información del TRLGDCU, sancionable por las autoridades de consumo autonómicas, con independencia de que después, el día del salto, el cliente firme un documento que sí lo explique. El defecto ocurre en el momento de la contratación (la reserva/pago), no se subsana retroactivamente por informar semanas después.
- **Riesgo de que la cláusula de "depósito no reembolsable" sea cuestionada como abusiva o inoponible frente al cliente concreto**: si un cliente reclama la devolución de su depósito alegando que nunca se le informó de que era no reembolsable antes de pagar (porque el enlace del checkbox estaba vacío), el centro tiene una posición débil para oponerle esa cláusula, porque:
  - No puede probar (art. 60, carga de la prueba al empresario) que la información se dio antes de la vinculación contractual.
  - Bajo el régimen general de cláusulas no negociadas individualmente (arts. 80 y siguientes TRLGDCU — control de transparencia e incorporación), una condición económica que no fue accesible ni comprensible en el momento de contratar tiene un riesgo real de no considerarse válidamente incorporada al contrato, o de interpretarse a favor del consumidor en caso de duda.
  - Esto **no depende de si la cláusula "en abstracto" es abusiva** (una cláusula de depósito no reembolsable, si se informa correctamente y es proporcionada, es lícita — así lo indican fuentes de consumo sobre tarifas no reembolsables en alojamiento turístico) sino de si **se informó a tiempo y de forma verificable**. El defecto de I Jump hoy es de **momento y de prueba**, no necesariamente de fondo.

**Conclusión práctica:** No, legalmente **no es prudente ni suficiente** dejar la aceptación de las condiciones comerciales (depósito no reembolsable, cancelación 72h) para el día del salto cuando el pago ya se hizo semanas antes, **si en el momento de la reserva/pago el enlace estaba vacío y no hubo ninguna otra forma verificable de informar al cliente**. El riesgo no es tanto que un juez anule la cláusula por "abusiva en sí" (probablemente no lo sea, si es razonable y está justificada por gastos de operación en pista y de cupo reservado), sino que un cliente que reclame el depósito tenga argumentos sólidos de que nunca se le informó a tiempo, y que la empresa no pueda probar lo contrario.

---

## 3. Menores

**[VERIFICACIÓN PARCIAL]** No se ha podido acceder al texto vigente y completo del Reglamento Básico de Paracaidismo de la RFAE que regule específicamente la edad mínima para saltos tándem con consentimiento de tutores. Los intentos de descarga de los PDF reglamentarios (aereamadrid.es, famur.org, fada.aero) no devolvieron contenido legible con esa cláusula.

Lo que sí se puede afirmar:

- **[VERIFICADO]** El benchmark de centros comerciales (sección 4) muestra que la **práctica de mercado dominante en España es 18 años como edad general**, con menores admitidos **desde los 16 años con autorización de ambos padres/tutores legales** (verificado explícitamente en Skydive Barcelona/Saltamos y Skydive Empuriabrava, ambos indicando "autorización de ambos tutores legales" para menores de 18). Ningún centro del benchmark publica en su web un umbral de 14 años.
- **[INFERENCIA]** La referencia del documento de I Jump a "14 años con consentimiento de los tutores, según ley" **no ha podido confirmarse contra ninguna norma específica sobre paracaidismo**. Es posible que la cifra de 14 años provenga, por analogía indebida, del régimen general de capacidad de obrar de menores en otros ámbitos (p. ej. determinados actos de la vida civil, o el umbral de 14 años relevante en materia penal o de protección de datos — art. 7 LOPDGDD permite a mayores de 14 años prestar su propio consentimiento para tratamiento de datos), pero **estos regímenes no son aplicables directamente a la asunción de riesgo físico de una actividad extrema como el paracaidismo tándem**, y **no equivalen a una autorización legal específica para saltar en tándem a los 14 años**. La búsqueda no ha localizado ninguna norma española que fije 14 años como edad mínima para paracaidismo. **Recomendación: verificar con la RFAE directamente (o con el club/federación autonómica correspondiente) cuál es la edad mínima reglamentaria vigente antes de mantener esa cifra en el documento**, y corregir la referencia "según ley" si no se puede citar la norma exacta — afirmar una base legal inexistente es en sí mismo un riesgo (información engañosa al consumidor, art. 5-7 y concordantes del TRLGDCU sobre prácticas comerciales desleales).
- **[VERIFICADO]** Para el marco general de consentimiento informado en menores en España (Ley 41/2002, de autonomía del paciente, aplicable directamente sólo a actos médico-sanitarios, pero usada por analogía en la doctrina): la mayoría de edad sanitaria para consentir por sí mismo se sitúa en los 16 años; para menores de 16 años se exige el consentimiento de representantes legales, con derecho del menor a ser oído a partir de los 12 años. Esto **no es aplicable directamente** al paracaidismo (que no es un acto médico), pero es el marco de referencia más cercano en el ordenamiento español sobre consentimiento a intervenciones sobre la propia integridad física, y explica por qué 16-18 años (no 14) es el rango que efectivamente usan los operadores comerciales.

**Conclusión:** la cifra de 14 años del documento actual de I Jump **no está respaldada por ninguna fuente verificada en esta investigación** y contradice la práctica observada en el resto del sector español (16-18 años). Se recomienda revisarla con la RFAE/federación autonómica antes de la próxima actualización del documento.

---

## 4. Benchmark de centros españoles de paracaidismo

| Centro | Método de verificación | ¿Aviso legal web (LSSI)? | ¿Condiciones comerciales públicas? | ¿Política de cancelación publicada? | ¿Waiver/consentimiento informado publicado en la web? | Edad mínima publicada |
|---|---|---|---|---|---|---|
| **Skydive Spain (Sevilla)** — skydivespain.com | Fetch directo de `/terminos-y-condiciones/` | Integrado en la misma página | **Sí**, muy detalladas: depósito no reembolsable, recargo por peso >95kg, prohibición de alcohol/drogas, seguro obligatorio, reconocimiento de riesgo de muerte | Sí (no-show pierde depósito sin aviso 48h) | Parcialmente — la página incluye reconocimiento de riesgos extremos y exención de responsabilidad para paracaidistas con licencia, dentro del mismo documento comercial | No se encontró cifra explícita en esta página |
| **Skydive Empuriabrava** — skydiveempuriabrava.com | Fetch directo de `/aviso-legal/` + búsqueda web | Sí, LSSI puro (JIP Aviació S.L.U.) | **No** en esa página — remite a un documento separado de "Condiciones de Venta" no auditado directamente | No verificado en el aviso legal; referencias de terceros indican min. 35kg, cert. médico >65 años | No verificado (documento separado, no accedido) | Autorización de ambos tutores legales para menores de 18 (vía búsqueda, no vía fetch directo) |
| **Skydive Barcelona / Saltamos.es** — skydive.barcelona | Fetch directo de `/legal-notice/` + búsqueda web | Sí, LSSI puro (JIP Aviació S.L.U., mismo grupo que Empuriabrava) | No en esa página (remite implícitamente a condiciones de reserva de terceros/Aladinia) | No en el aviso legal; datos de cancelación proceden de agregadores (Expedia, Aladinia), no verificados en la web propia | No | "Menor de 18 años requiere autorización de ambos tutores legales" (fuente: fragmentos indexados, no fetch directo verificado) |
| **Skydive La Mancha** (grupo AIRCRUZ S.L., Requena) — skydivelamancha.com | Fetch directo de `/aviso-legal/` | Sí, LSSI puro y genérico (definiciones, propiedad intelectual, jurisdicción Madrid) | **No** — sin cláusula de depósito, cancelación ni menores en esta página | No | No | No |
| **Skydive Requena** (mismo grupo AIRCRUZ S.L.) — skydiverequena.com | Fetch directo de `/aviso-legal/` | Sí, idéntico patrón al anterior (mismo grupo, misma plantilla) | No | No | No | No |
| **Skydive Córdoba** — skydivecordoba.com | Fetch directo de `/terminos-y-condiciones/` | No es un aviso legal LSSI clásico — la página fusiona condiciones operativas | No aplica (ver siguiente columna) | **Sí**: depósito 60€ "NO reembolsable en ningún caso", cambios hasta 3 meses con min. 3 días de antelación, reprogramación gratuita si cancela el centro | No — la propia página indica expresamente que no incluye exención de responsabilidad formal ni condiciones para menores | No |
| **Skydive Costa Cálida** — skydivecostacalida.com | Fetch fallido (DNS no resuelto) — no verificado directamente | No verificado | No verificado | No verificado | No verificado | No verificado |
| **Skydive Lillo / Skydive Madrid** (Lillo, Toledo) — skydivemadrid.es | Solo vía resultados de búsqueda (fetch directo no intentado en esta sesión, dato de agregador Aladinia) | No verificado directamente | Parcial — vía Aladinia: min. 16 años (autorización 16-18), máx. 100kg, cancelación 72h, bono válido 12 meses | Sí, según agregador (72h) | No | 16 años con autorización parental 16-18 (fuente: agregador Aladinia, no la web propia del centro) |
| **Paracaidismo Castellón / Sky Time Castellón** | Solo búsqueda, sin fetch directo — no se localizó dominio propio claro | No verificado | No verificado | Referencias genéricas de agregadores a cancelación gratuita por meteorología | No verificado | No verificado |

### Lectura del benchmark

- **[VERIFICADO en los centros con fetch directo]** El patrón más frecuente es: **aviso legal LSSI publicado y enlazado** (casi universal) + **condiciones comerciales publicadas en una página aparte en unos pocos centros** (Skydive Spain/Sevilla, Skydive Córdoba) **pero ausentes de la web en otros** (La Mancha, Requena, y aparentemente Empuriabrava/Barcelona, que remiten a documentos no públicos o no localizados). El waiver de responsabilidad **nunca aparece publicado de forma independiente y completa** en ningún centro verificado — cuando aparece contenido de asunción de riesgo, está mezclado dentro del documento comercial (caso Skydive Spain/Sevilla), no como documento aparte.
- Dos operadores del benchmark (La Mancha y Requena) comparten razón social (AIRCRUZ S.L.) y plantilla de aviso legal idéntica — **sugiere que ni siquiera tienen condiciones comerciales específicas publicadas en la web**, un patrón más cercano al de I Jump que al de Skydive Spain.
- Ninguno de los centros con web propia auditable publica un umbral de 14 años para menores; el rango observado es 16-18.
- **Limitación importante:** no se ha podido verificar en ningún caso, con navegación real del flujo de reserva, si el checkbox del formulario de reserva enlaza efectivamente a estas páginas o está vacío como en I Jump. Es una limitación de esta investigación (herramienta de navegación interactiva no disponible en esta sesión) y sería el siguiente paso lógico de verificación antes de tomar decisiones definitivas.

---

## 5. Recomendación de arquitectura documental

**[Recomendación propia, basada en el análisis legal de la sección 2 y en el patrón sectorial más robusto observado (Skydive Spain / Skydive Córdoba, que son los que mejor cubren el riesgo de información precontractual]**

Se recomienda una arquitectura de **tres documentos**, con momentos de aceptación distintos y complementarios (no redundantes):

1. **Aviso legal del sitio web** (LSSI-CE): identificación de la empresa, condiciones de uso del site, cookies, jurisdicción. Documento genérico, ya casi estándar en el sector. Enlazado en el pie de página de la web, sin necesidad de aceptación activa (es informativo, no contractual).

2. **Condiciones comerciales de la actividad (nuevo documento público)**: debe contener exactamente lo que hoy solo se comunica en pista — depósito no reembolsable y su importe, validez del bono (6 meses), política de reprogramación (72h), peso máximo (110kg) y recargo por sobrepeso, duración estimada de la actividad, prohibición de cámaras propias, plazo de conservación del vídeo (15 días), condiciones de promociones. **Este documento debe:**
   - Estar publicado en una URL pública y estable de la web de I Jump (no solo en un PDF entregado en pista).
   - **Ser el destino real del checkbox del formulario de reserva** ("He leído y acepto las condiciones comerciales y la política de depósito y cancelación"), de forma que quede constancia técnica (log, timestamp, IP) de que el cliente lo aceptó **antes de pagar el depósito**, cumpliendo así arts. 60, 97 y 98 TRLGDCU y dejando a la empresa en posición de poder probar el cumplimiento de la carga de la prueba del art. 60.
   - Aceptarse (de nuevo, no hace falta releerlo entero) también el día del salto en pista, como parte del documento QR, a modo de recordatorio y ratificación — no hay problema legal en pedir la aceptación dos veces, y refuerza la prueba.

3. **Consentimiento informado para la práctica de paracaidismo deportivo (documento separado, se mantiene la práctica actual de firma en pista)**: renuncia de responsabilidad, aptitud física, derechos de imagen, consentimiento médico, declaración de sobriedad, art. 6.2 CC, referencia al reglamento federativo aplicable (una vez verificado su contenido exacto con la RFAE). Este documento **debe seguir firmándose el día del salto**, porque su finalidad (verificar aptitud física real, sobriedad, condiciones meteorológicas y operativas del momento) solo tiene sentido en el momento presencial — no tendría valor legal ni práctico si se firmara semanas antes por internet. Esto es coherente con la práctica sectorial observada.

**Qué debe enlazar el checkbox del formulario de reserva de la web:** el documento nº 2 (condiciones comerciales de la actividad), no el nº 3. El checkbox actual, vacío, debería apuntar a esa nueva página pública de condiciones comerciales. Opcionalmente, puede añadirse un segundo checkbox o una nota informativa que anuncie al cliente que el día del salto deberá firmar además un consentimiento informado de seguridad — así se gestiona la expectativa sin necesidad de hacerle leer el documento nº 3 completo en el momento de pagar.

**Prioridad de implementación:** dado que hoy el checkbox está vacío, la acción de menor esfuerzo y mayor reducción de riesgo inmediato es: (a) publicar el documento nº 2 como página web accesible, y (b) enlazar el checkbox a esa página. Esto no requiere tocar el documento nº 3 (que ya existe y funciona en pista) ni renegociar el reglamento federativo sobre menores, que puede abordarse en un segundo momento tras confirmar con la RFAE la edad mínima real.

---

## Fuentes

### Normativa y análisis jurídico
- [Real Decreto Legislativo 1/2007 (TRLGDCU) — texto en BOE](https://www.boe.es/buscar/doc.php?id=BOE-A-2007-20555) (acceso parcial/fallido en esta sesión; recomendable re-verificar)
- [Artículo 103 TRLGDCU — Iberley](https://www.iberley.es/legislacion/articulo-103-ley-defensa-consumidores-usuarios)
- [Artículo 97 TRLGDCU — Iberley](https://www.iberley.es/legislacion/articulo-97-ley-defensa-consumidores-usuarios)
- [Artículo 98 TRLGDCU — Iberley](https://www.iberley.es/legislacion/articulo-98-ley-defensa-consumidores-usuarios)
- [Artículo 60 TRLGDCU — Iberley](https://www.iberley.es/legislacion/articulo-60-ley-defensa-consumidores-usuarios)
- [Artículo 61 TRLGDCU — Iberley](https://www.iberley.es/legislacion/articulo-61-ley-defensa-consumidores-usuarios)
- [Artículo 103 TRLGDCU — Noticias Jurídicas](https://noticias.juridicas.com/base_datos/Admin/rdleg1-2007.l2t3.html)
- [Derecho de desistimiento y exenciones — Servilegal Abogados](https://www.gruposervilegal.com/derecho-de-desistimiento-y-exenciones-al-mismo/)
- [La reforma de la Ley General para la Defensa de los Consumidores y Usuarios — ICA Cartagena](https://www.icacartagena.com/art_doctrinales/la-reforma-de-la-ley-general-para-la-defensa-de-los-consumidores-y-usuarios-y-v/)
- [Los deberes contractuales de información en materia de contratación a distancia — Redalyc](https://www.redalyc.org/jatsRepo/851/85147561007/html/index.html)
- [El art. 98 TRLCU, ¿requisitos formales de los contratos a distancia? — InDret](https://www.raco.cat/index.php/InDret/article/download/348241/439406/)
- [¿Es abusivo que te cobren la habitación del hotel si cancelas la reserva? — Kontsumobide](https://www.kontsumobide.euskadi.eus/entrada-blog/2018/es-abusivo-que-te-cobren-la-habitacion-del-hotel-si-cancelas-la-reserva/webkon01-detailblogs/es/)
- [Artículo 6 del Código Civil — Conceptos Jurídicos](https://www.conceptosjuridicos.com/codigo-civil-articulo-6/)
- [Código Civil consolidado — BOE](https://www.boe.es/buscar/pdf/1889/BOE-A-1889-4763-consolidado.pdf)

### Menores / consentimiento informado
- [Consentimiento informado del menor en España: reformas recientes — Dialnet](https://dialnet.unirioja.es/servlet/articulo?codigo=6978814)
- [El consentimiento informado en el menor de edad en España — Scielo](https://scielo.isciii.es/scielo.php?script=sci_arttext&pid=S1135-76062016000200008)
- [Consentimiento informado del menor en España — IDIBE](https://idibe.org/wp-content/uploads/2019/08/514-547.pdf)

### Reglamentación federativa (acceso no concluyente)
- [Reglamento de Paracaidismo RFAE (dic. 2006) — Aerea Madrid](https://www.aereamadrid.es/wp-content/uploads/2020/04/05_fae_reglamento_paracaidismo-dic2006.pdf) (PDF no legible en el fragmento accedido)
- [Reglamento General de Paracaidismo CSE — FAMUR](https://famur.org/site/wp-content/uploads/2013/11/Reglamento-General-de-Paracaidismo-CSE-y-normas-se-seguridad..pdf) (no accedido en detalle)
- [Reglamento de titulaciones de Paracaidismo — FADA](http://www.fada.aero/index_htm_files/REGLAMENTO%20PARACAIDISMO.pdf) (no accedido en detalle)

### Benchmark de centros (webs propias, fetch directo)
- [Skydive Spain — Términos y Condiciones](https://www.skydivespain.com/es/terminos-y-condiciones/)
- [Skydive Empuriabrava — Aviso Legal](https://skydiveempuriabrava.com/es/aviso-legal/)
- [Skydive Barcelona — Legal Notice](https://skydive.barcelona/en/legal-notice/)
- [Skydive La Mancha — Aviso Legal](https://skydivelamancha.com/aviso-legal/)
- [Skydive Requena — Aviso Legal](https://skydiverequena.com/aviso-legal/)
- [Skydive Córdoba — Términos y Condiciones](https://skydivecordoba.com/terminos-y-condiciones/)

### Benchmark de centros (solo vía agregadores/búsqueda, no verificado con fetch directo)
- [Skydive Madrid en Lillo — Yumping](https://www.yumping.com/en/skydiving/skydive-lillo--e2649)
- [Skydive Barcelona / Saltamos — Expedia](https://www.expedia.com/things-to-do/skydive-over-barcelona-13.a50315610.activity-details)
- [Skydive Empuriabrava — Tandem jump (EN)](https://skydiveempuriabrava.com/en/tandem-jump/)

---

## Resumen de brechas y próximos pasos sugeridos

1. Verificar con un abogado el texto exacto y vigente de los arts. 60, 97, 98 y 103.l) TRLGDCU directamente en boe.es (esta investigación no pudo confirmarlo carácter por carácter).
2. Contactar a la RFAE o federación autonómica para confirmar la edad mínima reglamentaria real para saltos tándem y corregir la referencia a "14 años, según ley" si no tiene respaldo normativo.
3. Publicar un documento de "Condiciones comerciales de la actividad" en la web y enlazar ahí el checkbox del formulario de reserva (acción de menor esfuerzo, mayor reducción de riesgo).
4. Mantener el consentimiento informado / exención de responsabilidad como firma presencial el día del salto, tal y como se hace hoy.
5. Como verificación adicional recomendable (no realizada en esta sesión): navegar en vivo el proceso de reserva de 2-3 competidores para confirmar si su checkbox realmente enlaza a condiciones o también está roto — esto contextualizaría mejor si I Jump está por debajo o en línea con el estándar real del sector.

## 6. Análisis sobre los documentos reales de I Jump (añadido 2026-09-09, tras leer los ficheros)

Las secciones 1-5 se elaboraron sobre el brief. Esta sección se elabora leyendo
los documentos que I Jump usa realmente
(`docs/legal/TERMINOS-Y-CONDICIONES.md`, `docs/legal/DOCUMENTO-CONSENTIMIENTO-INFORMADO.md`
y sus gemelos en `src/lib/waiver-templates/`). Aporta cuatro hallazgos que el
benchmark no podía ver.

### 6.1 El documento de T&C está internamente mezclado — esta es la causa raíz

El documento titulado "Términos y Condiciones" **no es un documento comercial**.
Es un documento híbrido que contiene dos naturalezas jurídicas incompatibles en
cuanto al momento de aceptación:

- **Bloque comercial (precontractual):** depósito no reembolsable, validez 6
  meses, reprogramación 72h, peso máximo y recargo de 45 €, duración 3-5 h,
  prohibición de cámaras propias, conservación del vídeo 15 días, promociones.
  Todo esto **debe aceptarse ANTES de pagar** (arts. 60, 97, 98 TRLGDCU).
- **Bloque de comprensión de seguridad (necesariamente presencial):** riesgo de
  lesión o muerte, contacto corporal con el instructor, emergencias en aeronave,
  posición de salida, caída libre, descenso, aterrizaje y —de forma decisiva—
  «He recibido por parte de un instructor las directrices (briefing) **antes de
  proceder a realizarlo**». Esto **no puede aceptarse en la reserva**: sería
  falso, porque el briefing no ha ocurrido todavía.

**Por eso el documento no se puede "mover a la web" tal cual, ni dejarse entero
para la pista.** Cualquiera de las dos opciones incumple una mitad. La solución
no es mover el documento: es **partirlo**.

### 6.2 El documento se contradice a sí mismo, y eso juega en contra de la empresa

El encabezado pide al cliente confirmar «que ha recibido este documento
informativo **con anterioridad a efectuar la reserva**», y una cláusula del
cuerpo afirma «Al hacer una reserva, los alumnos están aceptando los presentes
Términos y Condiciones».

Hoy ambas afirmaciones son **falsas**: el cliente firma en pista, semanas después
de pagar, y el checkbox de la web que debía enseñárselo antes no enlaza a nada.

El matiz relevante no es que sean falsas, sino **quién las escribió**. Es la
propia empresa la que fija por escrito el estándar ("esto debía entregarse antes
de reservar") y la que después no puede probar haberlo cumplido. En una
reclamación por el depósito, ese párrafo deja de ser una cláusula protectora y
pasa a ser **prueba en contra**: acredita que la empresa sabía cuál era el
momento correcto de informar. Es peor que no haber dicho nada.

### 6.3 La condición de socio del club no se informa en la reserva

El consentimiento informado declara: «El salto tándem es el primer salto de
bautismo **como socio**», y renuncia a acciones frente a «los directivos de este
centro» y «el club organizador», con referencia al Reglamento Básico de
Paracaidismo de la RFAE.

Es decir: el modelo jurídico es el de **club deportivo con alta de socio**
(coherente con la forma C.D. y con la cobertura federativa). Pero el cliente
**se entera de que se está haciendo socio de un club el día del salto**, cuando
firma. Si el alta de socio tiene cualquier efecto (cuota, licencia federativa,
condiciones de seguro, régimen de responsabilidad distinto), eso es una
"característica principal del servicio" y una "condición jurídica" del art. 60
TRLGDCU, y debería informarse en la reserva.

**Pregunta abierta para Raúl, no resoluble desde el código:** ¿el alta de socio
conlleva cuota o licencia federativa? ¿La cobertura de seguro del salto depende
de esa condición de socio? La respuesta determina si esto es una formalidad
inocua o una omisión informativa relevante.

### 6.4 Los "14 años según ley" — riesgo desproporcionado respecto al beneficio

El documento afirma: «Los alumnos deben tener al menos 18 años el día del salto
(**14 con consentimiento del/los tutores, según ley**)».

La investigación no ha localizado ninguna norma española que fije 14 años para
salto tándem, y el sector publica 16-18 (sección 3 y 4). La expresión «según
ley» **invoca una base legal que no se ha podido identificar**.

El riesgo aquí no es de consumo, es de otro orden: si un menor de 14-15 años
resulta lesionado, la empresa habría admitido por escrito que actuó amparándose
en una norma que no existe. Además, la cláusula no aporta negocio real (es una
franja de edad marginal en tándem comercial).

**Recomendación: retirar la referencia «según ley» de forma inmediata** y fijar
la edad mínima que el club decida y pueda sostener (16 o 18), confirmándola con
la RFAE o la federación autonómica. Retirar una afirmación no verificada es
gratis; mantenerla no.

### 6.5 Estado del Aviso Legal

Existe un borrador completo y competente sin publicar en
`chatbot/11_legal/borradores/aviso_legal_v1.md`. Cubre el art. 10 LSSI y está
bloqueado únicamente por placeholders: `{{CIF_IJUMP}}` (**ya conocido:
G-23600968**), `{{DOMICILIO_IJUMP}}`, `{{EMAIL_DERECHOS}}`, `{{DATOS_REGISTRALES}}`,
`{{DOMINIO}}`. **No cubre condiciones comerciales**, así que publicarlo NO
resuelve el checkbox: son dos documentos distintos.

### 6.6 Arquitectura recomendada, corregida

Cuatro documentos, no tres:

| # | Documento | Contenido | Cuándo se acepta | Estado |
|---|---|---|---|---|
| 1 | Aviso legal (LSSI) | Titular, CIF, propiedad intelectual, jurisdicción | No requiere aceptación; enlace en footer | Borrador listo, faltan datos |
| 2 | **Condiciones comerciales** | Depósito, validez 6 meses, 72h, peso y recargo, duración, cámaras, vídeo 15 días, promociones, condición de socio | **Checkbox de la web, ANTES de pagar**, con registro de fecha/hora | **No existe — hay que extraerlo del bloque comercial del doc actual** |
| 3 | Comprensión de seguridad y briefing | Riesgo de lesión/muerte, contacto corporal, emergencias, salida, caída libre, descenso, aterrizaje, briefing recibido | En pista, **después del briefing** | Existe, mezclado dentro del doc 2 |
| 4 | Consentimiento informado | Renuncia, aptitud, derechos de imagen, consentimiento médico, sobriedad | En pista | Existe y es correcto |

El cambio de fondo respecto a la sección 5: **el documento actual de "T&C" se
parte en el 2 y el 3**. El 2 sube a la web y es el destino del checkbox. El 3 se
queda en pista, donde su contenido es el único momento en que puede ser cierto.

### 6.7 Advertencia

Este informe es análisis técnico-jurídico documentado, **no asesoramiento legal
profesional**. Los arts. del TRLGDCU se citan vía fuente secundaria (ver nota
metodológica). Antes de publicar los documentos 2 y 3 conviene una pasada de un
abogado de consumo, que sobre un texto ya redactado es barata y rápida.
