# Preguntas para el módulo financiero del software iJump

**Objetivo:** completar la información necesaria para que el software refleje fielmente cómo opera iJump y permita presentar cuentas a la gestoría. Documento dividido por destinatario para que se pueda reenviar por partes.

**Cómo responder:** basta con contestar al lado de cada punto. Si algún dato no aplica o no se conoce, indíquelo y seguimos.

---

## Parte A. Para administración (Raúl / Ana)

### Tarifas y productos

1. Confirmar tarifas vigentes 2026:
   - Tándem + Handycam: ¿sigue siendo 275 €?
   - Tándem + Vídeo Externo: ¿sigue siendo 390 €?
   - Depósito de reserva: ¿sigue siendo 60 € por persona?
2. Paquete sin cámara: ¿existe internamente y a qué precio? (Se necesita solo para el registro contable. El asistente virtual no lo menciona a clientes, esto no cambia).
3. Upsells en el aeródromo: en el Excel aparecen "HC60", "HC70", "HC85" y "FOTOS 20".
   - ¿Qué representa cada uno y cuál es su precio?
   - El handycam contratado en sitio sobre un bono (Groupon u otros), ¿tiene varios precios según la plataforma o el caso?
   - "FOTOS 20", ¿es un añadido de fotografías por 20 €?
4. Reportaje terrestre: figura como línea de ingreso en el presupuesto. ¿En qué consiste y cuál es su precio?
5. Suplemento por sobrepeso (OW): confirmar 45 € para 90 a 100 kg. Por encima de 100 kg, ¿cómo se cobra cuando el equipo decide en el aeródromo?
6. Descuentos de grupo: ¿a partir de cuántas personas se aplican y con qué criterio o importe?
7. Bonos regalo propios de iJump: ¿qué producto incluyen, a qué precio y cómo se gestionan?

### Canales de venta y comisiones

> Modelo que asume el software (a confirmar): los canales se dividen en dos tipos.
> Directos, sin comisión de plataforma: Reserva directa, Bono regalo, Promoción.
> Plataformas independientes, con comisión: Groupon, Smartbox, Wonder Box, Jumping, Freedom.

8. Comisión de cada plataforma independiente (Groupon, Smartbox, Wonder Box, Jumping, Freedom):
   - ¿Qué comisión o porcentaje retiene cada una?
   - ¿Cuánto recibe iJump (neto) por cada salto vendido en cada plataforma?
   - ¿Hay alguna otra plataforma además de estas cinco?
9. Groupon en detalle: el importe que aparece en el portal, ¿es bruto o neto para iJump? ¿Cuándo y de qué forma se cobra ese dinero? (Es para separar correctamente el ingreso de la comisión).
9b. Promociones: ¿qué promociones concretas se aplican (grupo, pareja, puntuales) y con qué importe o porcentaje de descuento cada una? Son ventas directas (sin comisión), pero afectan al ingreso.
9c. Bonos regalo: confirmar que vienen pagados íntegramente desde la reserva y que no llevan comisión de terceros (relacionado con la pregunta 7).

> **Decisión cerrada 2026-07-01 (Ricardo):** el modelo de precio por plataforma
> queda resuelto — **no se registra comisión**. `participant_items.unit_price`
> guarda directamente el **neto** que iJump recibe por canal+producto (DIRECT =
> precio de catálogo; plataforma = neto acordado), vía la nueva tabla
> `channel_product_prices`. `sale_channels.commission_pct` queda como campo
> puramente informativo, sin uso en el motor de P&L ni en la itemización. Las
> preguntas 8-9 arriba **siguen abiertas** — no para decidir el modelo (ya
> decidido) sino para obtener los importes netos reales por plataforma con los
> que rellenar `channel_product_prices` (hoy solo tiene seed para DIRECT desde
> `products.base_price`; las filas de plataforma se cargan en cuanto lleguen
> los datos, sin necesitar otra migración). Ver
> `docs/act-as-como-mi-co-ceo-co-cto-reactive-kite.md` §Decisiones cerradas y
> `docs/PROPUESTA_ADMINISTRACION_TESORERIA_2026-07.md` (nota al pie de §5.1).

### Costes (para reproducir el Excel de explotación)

10. "Vuelos" (la mayor partida del presupuesto, alrededor del 33 %). Indicio de Ricardo: el "vuelo" en realidad sería solo la gasolina, por lo que convendría renombrar esta partida a "Combustible" y evitar confusión con la categoría de combustible actual (riesgo de contar dos veces).
    - ¿"Vuelos" es solo el combustible, o incluye también alquiler del avión u otros conceptos?
    - Si es solo combustible, ¿se solapa con la partida "Combustible" (pregunta 11)? ¿Cuál es la correcta?
    - ¿El avión es propio o de un tercero?
10b. Sueldo del piloto: ¿es una partida de coste propia, ligada al vuelo? ¿Cómo se paga (por vuelo, por jornada, fijo)? Hoy el software no lo contempla como partida separada.
11. Combustible: ¿el precio es por vuelo o por hora de vuelo? (ver pregunta 10 sobre el posible solape con "Vuelos").
12. Equipos: ¿a qué se refiere exactamente? Indicio de Ricardo: sería el alquiler de los paracaídas, y posiblemente alguno comprado.
    - ¿Es alquiler (coste recurrente), compra (capital), o ambos?
    - Si hay equipo comprado, ¿se amortiza? ¿Es un importe relevante para reflejar en el software?
13. Plegados: ¿precio por plegado o por salto? ¿El plegador es fijo o externo?
14. Edición de vídeos: ¿coste por vídeo? ¿Se hace internamente o se externaliza?
15. Tasas de aeródromo: ¿qué importe y con qué periodicidad (por día, por vuelo o mensual)?
16. ~~Instructores: tarifa por salto de cada instructor (Mihai, Raúl, Bravo, Isaac y cualquier otro).~~
    - ~~¿La tarifa cambia según el tipo de salto o de paquete?~~
    - **RESUELTO (2026-07-01, Ricardo):** No, la tarifa del instructor es fija, siempre la misma independientemente del tipo de salto o paquete. La única variación es que **el instructor que salta con la cámara externa cobra menos** que el instructor del salto tándem estándar — es una tarifa distinta por *rol en el vuelo* (tándem vs. cámara externa), no por tipo de paquete vendido. Pendiente: importe exacto de la tarifa de cámara externa por instructor (hoy solo `instructors.fee_per_jump` de Mihai = 40 €, sin distinguir rol).
17. Gastos fijos mensuales: seguro (responsabilidad civil y accidentes), hangar, gestoría y cualquier otro. ¿Importes y periodicidad?

### Fiscalidad y cuentas anuales

18. ¿La empresa está sujeta a IVA general (21 %) o a algún régimen especial? ¿Las tarifas indicadas arriba incluyen IVA o son sin IVA?
19. ¿Bajo qué sociedad o sociedades se factura? En el Excel hay una columna "Sociedad". ¿Operan con más de una entidad?
20. ¿Qué formato necesita la gestoría para llevar la contabilidad (Excel por categorías, libro de ingresos y gastos, un modelo concreto)? ¿Con qué periodicidad lo necesita (trimestral, anual)?
21. Para los datos generales de la empresa: número total de saltos realizados desde la apertura y año de inicio de operaciones.

---

## Parte B. Para el desarrollador (hermano)

22. ¿Qué consideras intocable del modelo de datos actual, para no romper la forma de operar al migrar?
23. ¿El módulo de finanzas ya tiene datos reales en producción o está todavía vacío? (Esto define si la migración debe preservar datos existentes).
24. ¿Hay un despliegue en Vercel o en producción activo? ¿Las credenciales de Supabase de producción son distintas de las del `.env.local` local?
25. ¿Prefieres revisar los cambios en dos PRs separados (UI por un lado, Finanzas por otro) o todo junto?
26. ¿Hay decisiones de diseño que quieras mantener sí o sí? (Por ejemplo: densidad alta de información, ausencia de modo oscuro por la legibilidad a pleno sol, etc.).

---

*Una vez recibidas las respuestas, podemos cargar el catálogo de precios real, ajustar las categorías de coste y dejar el módulo listo para que la gestoría exporte las cuentas.*
