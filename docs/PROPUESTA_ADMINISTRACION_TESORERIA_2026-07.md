# Propuesta — Módulo de Administración: Tesorería, nóminas operativas y cliente

**Fecha:** 2026-07-01
**Autor:** Ricardo (Edrai) como CEO/CTO del proyecto
**Estado:** PROPUESTA para revisión. No ejecutar sin visto bueno. Sucede y amplía a [`REVISION_ESTRATEGICA_OPERACIONES_2026-07.md`](REVISION_ESTRATEGICA_OPERACIONES_2026-07.md).
**Base:** benchmarking de software del gremio (Burble, LoadUp, DZ-Manager) y de sectores análogos (Checkfront, FareHarbor, Bókun) + estado real del código validado en sesión previa.

---

## 0. Replanteamiento de fondo (corrige la revisión anterior)

La revisión previa afirmaba que "no ser un CRM" era una decisión estructural. **Eso era describir el estado documentado del repo, no la estrategia correcta.** La estrategia correcta, confirmada por Ricardo:

- El software debe ser el **sistema único de registro** de todo lo que ocurre en el negocio: operación, comercial, financiero y de caja. **Cero Excels paralelos.**
- No cerrar la puerta a ninguna capacidad. El criterio no es "esto es un CRM / esto no lo es", sino **"¿esto le facilita la vida operativa al cliente y captura información que hoy se pierde?"**. Si sí, entra; si es funcionalidad porque-queda-bien, fuera.
- El módulo de reservas **ya es, de facto, un CRM**. El "Manifiesto" se llama así por el término del sector ("Manifest"), no porque el sistema no deba conocer al cliente.

En consecuencia, el modelo mental deja de ser "herramienta operativa + informe financiero aparte" y pasa a ser **un sistema integrado donde cada euro y cada persona quedan registrados una sola vez y se ven desde varias perspectivas.**

---

## 1. El hueco real: falta la vista de CAJA

Hoy existe un **P&L por devengo** (`/finanzas`): reconoce el ingreso cuando se presta el salto y el coste cuando se incurre. Responde a *"¿es rentable el negocio?"*.

Falta la **tesorería (caja)**: el dinero real que entra y sale. Responde a *"¿cuánto dinero tengo hoy, quién me debe, a quién debo y cuándo?"*.

Son dos vistas distintas del mismo dinero y **se necesitan ambas**. Un negocio pequeño con cobros por adelantado (depósitos de reserva) y pagos diferidos (nóminas de fin de semana, facturas de combustible) puede ser rentable en P&L y quedarse sin caja un jueves — o cobrar mucho por adelantado y creerse rico cuando ese dinero es una obligación futura de prestar el servicio (patrón que Checkfront modela explícitamente: depósito cobrado hoy ≠ ingreso devengado). El P&L mide si el modelo funciona; la tesorería evita el impago.

La tesorería se compone de **tres libros**, dos de los cuales hoy no existen:

| Libro | Qué es | Estado hoy |
|---|---|---|
| **Cobros / Cuentas por cobrar (AR)** | Lo que entra: quién ha pagado, cuánto falta por cobrar, cierre de caja diario por método | Parcial: existen `payments`, falta el "importe esperado" y la vista de pendientes |
| **Pagos a personal operativo (AP-nómina)** | Lo que sale a tu gente: instructores, plegador, piloto, cámara — devengado vs. pagado | Solo se calcula el coste agregado de instructores en el P&L; sin desglose por persona ni tracking de pago |
| **Pagos a proveedores (AP-proveedores)** | Lo que sale fuera: combustible, seguro, tasas, préstamo — con vencimiento | Parcial: existe `expenses`, sin estado pagado/pendiente ni vencimiento |

---

## 2. Principio rector (innegociable): una sola entrada de datos

Todo el diseño se somete a esta regla, que es lo que lo hace **usable por el personal a la vez que completo**:

> **El personal introduce cada dato una sola vez, en la operación (el manifiesto), durante la jornada. Las vistas de tesorería y P&L son agregaciones sobre ese mismo dato — nunca un segundo tecleo, nunca un Excel paralelo.**

Ejemplo (patrón Checkfront confirmado): la administrativa marca "cobrado 50€ en efectivo" en la ficha del participante → ese único clic alimenta a la vez el saldo pendiente de esa reserva, el AR global, el cierre de caja del día y la posición de tesorería. Un clic, cuatro vistas.

**Corolario:** cualquier cifra financiera que se pueda derivar de un dato operativo ya capturado NO tiene entrada propia. Solo lo que no nace de la operación (facturas de proveedor, tarifas de personal) justifica tecleo manual.

---

## 3. Qué hace el gremio y qué replicamos (benchmarking)

Priorizado para un centro **pequeño** (tándem, 1 avión, ~1 instructor, solo fines de semana). Descartado explícitamente lo que sería over-engineering.

| # | Capacidad | Qué hacen los líderes | ¿Replicar? |
|---|---|---|---|
| 1 | **Cierre de caja diario** | DZ-Manager (POS/Kiosk mode), LoadUp ("Cash Settlements"), Burble Payments. Cuadre efectivo vs. tarjeta vs. bizum al cerrar la jornada | **SÍ — máximo ROI.** Es el hueco más grande y el que opera solo en fin de semana más agradece |
| 2 | **Nómina de personal por rol** | Burble (payroll integrado: pilotos, saltadores, tándem), LoadUp ("Staff Payments"). Tarifa por salto diferenciada por rol, acumulada por persona, liquidada por periodo | **SÍ, versión esencial.** El manifiesto ya sabe quién saltó; derivar devengado por persona + estado pagado/pendiente. Evitar: escalas, IRPF, nóminas formales |
| 3 | **Saldo pendiente por reserva + bonos** | Burble ("jump account" con saldo, gift cards, historial). DZ-Manager guarda cuenta de cliente | **Parcial.** Saldo pendiente por reserva: SÍ (engancha con reservas). Bonos/vouchers regalo: SÍ (relevante comercialmente en tándem). Cuenta de cliente con saldo permanente: over-engineering para tándem de una visita |
| 4 | **Cuentas por pagar a proveedores** | Ninguno lo destaca; el gremio lo lleva fuera, en contabilidad general | **Versión mínima.** Registro simple de facturas (concepto, importe, vencimiento, pagado/pendiente) para cerrar el flujo de caja. Sin conciliación bancaria ni ERP |
| 5 | **Ficha/historial de cliente (CRM-lite)** | Feature nuclear en Burble/DZ-Manager (historial entre visitas) | **Puerta abierta, no ahora.** Diseñar el modelo para soportar un cliente identificado por teléfono/email desde el principio, pero UI mínima: al dar de alta, avisar "este cliente ya saltó el X, ver notas". Sin CRM de marketing |

---

## 4. Diseño propuesto

### 4.1 Dónde vive en la UI

- **Captura diaria → se queda en el Manifiesto**, donde el personal ya trabaja. Marcar un cobro, asignar quién plegó/pilotó, etc. se hace ahí durante la operación. No se crea un sitio nuevo para el día a día.
- **Vistas de administración → nueva área "Administración"** (uso de Raúl/administrativa, no del instructor en pista), con pestañas:
  - **P&L** (la actual `/finanzas`, devengo — *"¿es rentable?"*)
  - **Caja** (cierre diario por método, esperado vs. contado, descuadres)
  - **Cobros** (AR — reservas/participantes con saldo pendiente)
  - **Pagos** (AP — dos sub-vistas: personal operativo y proveedores)
  - **Bonos** (vouchers regalo) *(fase posterior)*

Recomendación: no meter todo dentro de `/finanzas` (se satura). Mejor `/finanzas` = P&L, y una sección hermana `/administracion` (o `/tesoreria`) para caja + cobros + pagos. Decisión final de navegación, en plan mode.

### 4.2 Modelo de datos (conceptual — el SQL se diseña en plan mode)

Reutiliza al máximo lo existente. Solo lo que **no** nace de la operación es tabla nueva.

1. **`participant_items` (ya existe, hay que ALIMENTARLA) — la pieza clave.** Vincula cada participante con los productos que compró (del catálogo `products`, ya poblado con precios reales). Da el **importe esperado** por participante. Sin esto no hay saldo pendiente, no hay desglose de ingresos por producto, y no hay AR. **Es el desbloqueo de casi todo lo demás.**
   - `AR (saldo pendiente) = Σ(participant_items.precio) − Σ(payments.amount)` → **es una resta derivada, no una tabla.**
2. **Personal operativo (generalizar `instructors`):** hoy solo `instructors.fee_per_jump`. Ampliar a roles con tarifa propia: instructor tándem, **instructor de cámara (cobra menos — confirmado por Raúl)**, plegador (por pliegue/salto), piloto (por vuelo). Requiere: (a) catálogo de tarifas por rol, (b) atribución por operación de quién hizo cada rol (el instructor tándem ya está en `participants.assigned_instructor_id`; faltan cámara, plegador, piloto).
3. **Liquidaciones de personal (`staff_settlements`, tabla nueva):** devengado por persona y periodo, con estado pagado/pendiente + fecha de pago. Debe **reconciliar con el P&L**: el P&L muestra el coste devengado; tesorería muestra cuánto de eso está realmente pagado.
4. **Facturas de proveedor (AP):** extender `expenses` con `estado` (pendiente/pagado), `fecha_vencimiento`, `fecha_pago` — o tabla `payables` nueva. Decisión en plan mode.
5. **Cierre de caja (`cash_close`, tabla nueva):** uno por jornada operativa. Efectivo/tarjeta/bizum esperado (derivado de `payments`) vs. contado (tecleado al cerrar) + descuadre con nota. Log de descuadres para revisar patrones.
6. **Cliente (CRM-lite):** entidad `customer` identificada por teléfono/email que agrupa participantes entre reservas. Crear el FK desde el principio aunque la UI sea mínima (aviso de "cliente ya visto"). No borra la puerta a más CRM en el futuro.
7. **Bonos/vouchers:** saldo canjeable. Fase posterior, tras confirmar con Raúl cómo funcionan hoy sus bonos.

---

## 5. Decisiones de negocio pendientes (Raúl / Ricardo) — algunas bloquean fases

Ver también [`finanzas/PREGUNTAS_NEGOCIO_FINANZAS.md`](finanzas/PREGUNTAS_NEGOCIO_FINANZAS.md).

1. ~~**Modelo de precio por plataforma (BLOQUEA Fase 1).**~~ **Resuelto — decisión cerrada 2026-07-01 (Ricardo).** Cuando un cliente viene por Groupon/Smartbox: el precio de venta al cliente lo fija la plataforma (no lo controla ni lo registra iJump) y **no se registra comisión** en el software. `participant_items.unit_price` guarda el **neto** que iJump recibe por canal+producto (DIRECT = precio de catálogo; plataforma = neto acordado por Raúl), a través de la nueva tabla `channel_product_prices` (matriz canal × producto → precio neto, Sprint 1). `sale_channels.commission_pct` queda como campo puramente informativo, sin lectura por el motor de P&L ni por la itemización — este documento y la exploración previa asumían el modelo alternativo ("catálogo único − comisión vía `commission_pct`"), que queda descartado. El "cobro pendiente" de un cliente de plataforma es un cobro **contra la plataforma**, no contra el cliente en pista (que solo paga suplementos). Ver `docs/act-as-como-mi-co-ceo-co-cto-reactive-kite.md` §Decisiones cerradas para el razonamiento completo y `docs/finanzas/PREGUNTAS_NEGOCIO_FINANZAS.md` (preguntas 8-9, ahora reencuadradas para pedir solo los importes netos, no el modelo).
2. **Tarifa del instructor de cámara** (cobra menos que el tándem — confirmado; falta el importe). Y confirmar tarifas de **plegador** (¿por pliegue o por salto?) y **piloto** (¿por vuelo?). (Preguntas 13, 10b, 16 del doc de negocio.)
3. **Bonos regalo propios de iJump:** qué incluyen, precio, cómo se gestionan (pregunta 7). Bloquea la fase de vouchers.
4. **Importes de préstamo del avión y seguro** (siguen a 0 en el sistema).

---

## 6. Plan por fases (propuesto — se detalla en `tasks/`)

Orden por dependencia y ROI. Cada fase = una rama/PR independiente.

- **Fase 0 — Decisiones de negocio.** Resolver §5.1 y §5.2 con Raúl/Ricardo. No es código; puede correr en paralelo.
- **Fase 1 — Itemización + saldo pendiente (AR). LA CLAVE.** Alimentar `participant_items` desde el alta de participante (una sola entrada, en el manifiesto). Saldo pendiente visible en el manifiesto (badge rojo). Vista de cobros pendientes. *Desbloquea de paso el desglose de ingresos por producto ("Sin desglosar").* Depende de la decisión 5.1.
- **Fase 2 — Cierre de caja diario.** Máximo ROI operativo. Cuadre por método, esperado vs. contado, descuadres.
- **Fase 3 — Nómina de personal operativo.** Generalizar roles + tarifas, atribución por operación, devengado vs. pagado, liquidación por periodo. Depende de la decisión 5.2.
- **Fase 4 — Cuentas por pagar a proveedores + posición de caja.** Facturas con vencimiento y estado. Vista de posición de caja (AR + caja − AP) en el tiempo.
- **Fase 5 (opcional/futuro) — CRM-lite + bonos.** Ficha de cliente por teléfono/email con historial, y vouchers regalo. Depende de la decisión 5.3.

**Recomendación de arranque:** Fase 0 (Ricardo, ya) en paralelo con Fase 1 (implementación). Fases 1-2 dan el 80% del valor operativo. Fases 3-5, incrementales.

---

## 7. Riesgos y notas

- **Consistencia P&L ↔ tesorería:** las dos vistas deben cuadrar sobre el mismo dato. El motor de P&L (`pnl-engine.ts`) es puro y con checks de regresión — cualquier cambio debe pasar esos checks.
- **Migraciones aditivas y reversibles** (regla del repo): `ADD COLUMN` con default, tablas nuevas, bloque ROLLBACK. Nada de `ALTER TYPE ADD VALUE`.
- **Backfill del histórico:** los datos ya cargados (oct 2025) viven en `payments` sin `participant_items`. Decidir con Raúl si se quiere el histórico también desglosado (migración de backfill) o solo prospectivo. No es bloqueante.
- **No romper el flujo del staff:** la Fase 1 añade selección de producto al alta; hay que cuidar que siga siendo rápido en tablet a pie de pista (no convertir un alta de 10 segundos en un formulario largo).
