# Plan integrado: Administración/Tesorería + Reservas-CRM (iJump)

> ## ⚠️ ESTADO DE EJECUCIÓN (actualizado 2026-07-04, sesión retoques operativos)
>
> **Sprints 1-3 MERGEADOS (PRs #42/#44/#45-#46, más #47 de Alejandro). Nuevo PR de retoques
> operativos abierto (`feature/operational-tweaks`). Migraciones pendientes de aplicar A MANO en
> Supabase (`ojngrplnuhcenulfnfps`), EN ORDEN (las de sprints anteriores si no están ya):
> `20260702000000_treasury_cash_close.sql` → `20260703000000_reservations_move_participants.sql` →
> `20260704000000_flight_interval_and_extraordinary.sql` →
> `20260704000001_reservation_source_platforms.sql` (⚠️ NO reversible: ALTER TYPE,
> excepción prevista en el issue #43) → `20260704000002_leads_aging_phone_dedupe.sql` (⚠️ incluye UPDATE
> de normalización de teléfonos, excepción aprobada). Después regenerar `database.types.ts`.**
>
> - ✅ **Mini-sprint CRM P0 — HECHO (2ª sesión 2026-07-04, Ricardo)**, rama `feature/crm-p0-aging-dedupe`
>   (apilada sobre `feature/operational-tweaks` / PR #48 — mergear #48 primero). Ejecuta los dos P0 de
>   `docs/reservas/CRM_REVIEW_2026-07.md` (prerequisito para conectar el chatbot):
>   - **Aging de leads**: columna `participants.last_contact_at` (migración `20260704000002`, backfill desde
>     `updated_at`), bump en cada contacto real (alta, edición de datos de contacto, fijar fecha, confirmar,
>     reagendar — NO en ediciones operativas); en `/reservas` tab Pendientes: banner ámbar "N leads sin
>     contacto >48h", badge por fila (ámbar 48-96h, rojo >96h) y toggle de ordenación por antigüedad.
>     TENTATIVE excluida a propósito (espera a su mes, no a un humano).
>   - **Dedupe por teléfono**: `normalizePhone` (`src/lib/phone.ts`, espejo EXACTO del SQL de la migración,
>     check `__phone_check.mts`) aplicado en todos los puntos de escritura; la migración normaliza los
>     teléfonos existentes (⚠️ UPDATE de datos, excepción aprobada por Ricardo a la regla aditivo/reversible,
>     como el enum de #43); `findActiveLeadByPhone` (lead activo + fecha futura o sin fecha); aviso de posible
>     duplicado en el alta manual (no bloqueante); **API bot: POST /reservations con teléfono ya activo →
>     200 + `duplicate: true`** con el lead existente (contrato v1.1 en `BOT_API_CONTRACT.md`).
>   - Verificación: `tsc`, `build`, 5 checks jiti en verde. Migración `20260704000002` pendiente de aplicar
>     A MANO tras el merge (después de las 4 anteriores, ver lista abajo).
>   - 🔁 **Pendiente lado Ricardo**: trasladar la semántica `duplicate: true` al proyecto del chatbot
>     (el bot debe pedir SIEMPRE el teléfono antes de crear reserva y manejar la respuesta 200).
>
> - ✅ **Retoques operativos — HECHO (sesión 2026-07-04, Ricardo)**, rama `feature/operational-tweaks`:
>   - Intervalo de vuelos configurable (`business_settings.flight_interval_minutes` = 45, verano) y
>     primer vuelo a las 08:00; lo leen la RPC `assign_seat` (make_interval, fallback 60) y
>     `handleAddFlight` vía policy. Cambiar de temporada = cambiar el setting, sin tocar código.
>   - Fuente completa: enum `reservation_source` + WONDERBOX/JUMPING/FREEDOM (ejecuta el issue #43);
>     labels unificados en `RESERVATION_SOURCE_LABELS` (domain.ts) — 4 copias duplicadas eliminadas.
>     Las 3 plataformas nuevas clasifican como owedBy PLATFORM en AR. SIN filas de precio neto aún
>     (pendiente Raúl S21; fallback a products.base_price funciona mientras tanto).
>   - Categoría de gasto "Gasto extraordinario" (GENERALES, manual, motivo en description).
>   - Chips de ocupación por hora al crear reserva (getDayOccupancy) + aviso no bloqueante si la
>     hora elegida está llena. Verificado en preview autenticado.
>   - `docs/reservas/CRM_REVIEW_2026-07.md`: revisión CRM experta con roadmap priorizado. **Los dos
>     P0 (aging de leads y dedupe por teléfono) deben ejecutarse ANTES de conectar el chatbot.**
>
> - ✅ **Sprint 1 — MERGEADO (PR #42)**. Tras el merge: aplicar a mano
>   `supabase/migrations/20260701000000_treasury_itemization_ar.sql` en Supabase (`ojngrplnuhcenulfnfps`)
>   si no se ha hecho ya.
> - ✅ **Sprint 2 — HECHO (sesión 2026-07-02, Ricardo)**: rama `feature/treasury-cash-close`, PR abierto.
>   Verificación en verde (`__pnl_check`, `__gastos_check`, `__itemization_check`, nuevo `__cashclose_check`,
>   `tsc`, `build`). Entregado: `cash_close` + `cash_close_lines` (normalizada por `payment_method`;
>   `expected` = snapshot congelado al cerrar, nunca recalculado; `counted` = único tecleo), motor puro
>   `cash-close-engine.ts`, actions `getCashCloseSummary`/`closeCash`/`updateCashClose`/`listCashCloses`,
>   modal de cierre + botón en la barra de tabs del manifiesto (**cero cambios en `DayHeader.tsx`**,
>   los cambios locales de Alejandro siguen a salvo), pestaña "Caja" en `/administracion/caja`.
>   Tras el merge: aplicar a mano `20260702000000_treasury_cash_close.sql` y regenerar `database.types.ts`
>   (los tipos de las tablas nuevas ya están añadidos a mano, como en Sprint 1).
>   ⚠️ Verificación visual en preview pendiente (login sin credenciales documentadas): probar el flujo
>   cerrar caja → descuadre → nota → vista Caja al aplicar la migración.
> - ✅ **Decisión keying cerrada (Ricardo, 2026-07-02)**: `channel_product_prices` se queda keyed por el
>   enum `reservation_source`. Pendiente documentado en **issue #43** (ampliar enum + filas de precio en la
>   misma migración cuando llegue Wonderbox/Jumping/Freedom).
> - ✅ **Sprint 3 — HECHO (misma sesión 2026-07-02, Ricardo)**: rama `feature/reservations-crm`
>   (apilada sobre `feature/treasury-cash-close`), PR abierto. Verificación en verde (4 checks jiti,
>   `tsc`, `build`). **Decisión de negocio que corrigió el handoff original (Ricardo):** cancelar un
>   vuelo individual ≠ cancelar el día — la operativa real es desplazar a sus ocupantes más adelante
>   EN EL MISMO DÍA (el manifiesto es orden de vuelo, no exactitud horaria), así que `cancelFlight`
>   NO envía leads a RESCHEDULE_NEEDED (eso queda solo para el día entero vía `handleWeatherCancellation`).
>   Entregado:
>   - **E2**: RPC `reservations_move_participants` (FOR UPDATE solo sobre el vuelo destino — sin deadlock
>     contra assign_seat, razonado en la cabecera de la migración; todo-o-nada; solo los activos consumen
>     plaza; realinea `confirmed_time` de leads CONFIRMED — el drag&drop lo dejaba stale, cambio intencional
>     que afecta a lo que devuelve la API del bot). `moveParticipants` + `moveParticipant` reimplementado
>     encima (el DnD del manifiesto ahora valida capacidad: fix de overbooking). `cancelFlight(flightId,
>     destination)` = flujo guiado con `CancelFlightDialog` (vuelo destino existente con plazas libres o
>     vuelo nuevo con `flight_number = MAX+1`); guard en `deleteFlight` si tiene participantes (cierra el
>     trap de huérfanos invisibles).
>   - **E1**: `InlineField` extraído a componente compartido; edición inline en `/reservas` de
>     fullName/phone/email y preferredTime (solo tab pending); `updateParticipant` + `preferredTime`.
>     NO se creó `updateLead` (innecesario, como marcaba el handoff).
>   - **E3**: `rescheduleLeadsBatch` secuencial con restore de `RESCHEDULE_NEEDED` en fallos (sin él, los
>     leads fallidos quedarían en NEW y desaparecerían del grupo — trap de `rescheduleLead` documentado en
>     el código); banner por día cancelado en `/reservas` (grupos ≥2 por `preferredDate`, que se conserva);
>     `GroupRescheduleModal` con fecha por lead sobre un calendario compartido + resumen por lead.
>   - ⚠️ QA visual autenticada pendiente (checklist en el PR); nota del handoff no ejecutada a propósito:
>     el helper DRY `releaseParticipantsFromFlights` dejó de tener sentido al cambiar la semántica de
>     cancelFlight (ya no libera a nadie: mueve). `handleWeatherCancellation` quedó intacto.
>   - 🔁 **Pendiente lado Ricardo**: trasladar la operativa de reubicación grupal al proyecto del chatbot.
> - 💡 **Sugerencias futuras (Ricardo, 2026-07-02 — "darle una vuelta", NO implementar aún):** el manifiesto
>   registra orden de vuelo, no exactitud horaria — evaluar si conviene algo más al recolocar vuelos
>   cancelados a mitad de día (hoy: mover ocupantes + notas del cliente para el contexto); posible mejora
>   del flujo de recolocación intra-día apoyada en back-to-back y huecos de media hora.
> - ⛔ Sprints 4-5 siguen bloqueados por datos de Raúl; Sprint 6 futuro (decisión 5.3).

## Contexto

El software de iJump ya tiene en producción dos módulos maduros: **Finanzas v2** (P&L
por devengo, `pnl-engine.ts`) y **Reservas** (lead → confirmación/tentativa → manifiesto
+ API del bot). Falta la capa de **tesorería/caja** ("¿cuánto dinero tengo hoy, quién me
debe, a quién debo y cuándo?") y, transversalmente, tratar reservas como el **inicio del
pipeline** con edición tipo CRM y reubicación de cancelaciones.

El desbloqueo de casi todo es una tabla que existe pero está **vacía en producción**:
`participant_items`. Ningún flujo la alimenta, así que hoy todos los ingresos salen como
"Sin desglose" y no hay saldo pendiente (AR). Alimentarla es la pieza 0 de la que cuelga
el desglose de ingresos, el AR y el cierre de caja.

**Principio rector (innegociable): UNA SOLA ENTRADA DE DATOS.** Cada dato se teclea una
vez, en la operación (manifiesto). Tesorería y P&L son agregaciones sobre ese mismo dato,
nunca un segundo tecleo ni un Excel paralelo. Solo lo que no nace de la operación
(facturas de proveedor, tarifas de personal, precios netos de plataforma) justifica
entrada manual.

## Decisiones cerradas con Ricardo (2026-07-01)

1. **5.1 — Precio por plataforma = "precio de venta propio", SIN registrar comisión.**
   El cliente paga a la plataforma (Groupon/Smartbox/…) y recibe un bono; lo canjea con
   iJump, que verifica el nº de bono. La plataforma paga a iJump el **neto acordado**
   (distinto por plataforma); la comisión ni llega ni se registra. Implicaciones:
   - `participant_items.unit_price` = precio **neto** que iJump percibe para ese
     canal+producto (para DIRECT = precio de catálogo; para plataforma = neto acordado).
   - Se **descarta** `sale_channels.commission_pct` como mecanismo. Nueva tabla
     `channel_product_prices` (matriz canal × producto → precio neto) que autorrellena el
     `unit_price` al elegir el canal en el alta.
   - El "cobro pendiente" de un cliente de plataforma es un **cobro contra la plataforma**
     (no contra el cliente en pista, que solo paga suplementos). Las plataformas pagan a
     ~1 semana → **dato a confirmar con Raúl** (payment terms por plataforma), relevante
     para la posición de caja (Sprint 5).

   - **⚠️ Corrección respecto a `docs/PROPUESTA_ADMINISTRACION_TESORERIA_2026-07.md`:**
     ese documento (y la exploración previa) asumían el modelo alternativo ("catálogo
     único − comisión vía `sale_channels.commission_pct`"). Queda descartado. Antes de
     implementar el Sprint 1, actualizar esa propuesta y/o
     `docs/finanzas/PREGUNTAS_NEGOCIO_FINANZAS.md` con esta decisión y su razonamiento,
     para que quien lea el doc en el repo no implemente el modelo equivocado.

2. **Secuencia:** las mejoras de Reservas-CRM (edición inline + cancelar vuelo/día +
   reubicar grupos) van **después** de tesorería F1–F2 (máximo ROI financiero primero).

3. **Histórico oct-2025: forward-only.** No se toca; sigue en "Sin desglose" vía COALESCE.
   Reintroducción manual opcional más adelante si Raúl la pide.

4. **Ejecución:** este plan lo implementa Alejandro (`alepm03`), no Ricardo/Claude en esta
   sesión. Ver §Ramas y coordinación para el handoff.

## Diseño integrado (modelo de datos + motor)

### Reutilización (lo que YA existe y no se re-crea)
- `products` (poblado con precios reales) y su enum `ProductCategory`.
- `participant_items` con `unit_price` (snapshot) + `amount` (GENERATED) — solo hay que
  **alimentarla**; las server actions `createParticipantItem/updateParticipantItem/
  deleteParticipantItem` ya existen en `src/lib/actions/finance.ts` (~L797-855).
- `payments` con `method` (EFECTIVO|TARJETA|BIZUM|TRANSFERENCIA|GROUPON) y `stage`
  (RESERVA|LIQUIDACION|SUPLEMENTO).
- `pnl-engine.ts`: regla `participantRevenue = COALESCE(Σ items, Σ payments)` y desglose
  a `SIN_DESGLOSE` cuando no hay items. **Invariante a preservar:** Σ categorías ===
  revenueTotal. Todo cambio pasa `src/lib/finance/__pnl_check.mts`.
- Reservas: `leads.ts`, `availability.ts`, `reservations_assign_seat` RPC, cron
  `promote-leads`, `handleWeatherCancellation`.

### Insight "una sola entrada": packageType → items automáticos
El `packageType` (SOLO | HANDYCAM | VIDEO_EXTERNO | FOTOS | HANDYCAM_FOTOS) **ya se captura
en la reserva**. Se mapea a productos para autogenerar la línea base de `participant_items`
sin tecleo extra:
- SOLO → TANDEM_BASE · HANDYCAM → TANDEM_BASE+CAMERA_HANDYCAM · VIDEO_EXTERNO →
  TANDEM_BASE+CAMERA_EXTERNAL · FOTOS → TANDEM_BASE+PHOTOS · HANDYCAM_FOTOS →
  TANDEM_BASE+CAMERA_HANDYCAM+PHOTOS.
- `unit_price` se resuelve por canal: DIRECT → catálogo; plataforma → `channel_product_prices`.
- El sobrepeso (OVERWEIGHT) y upgrades son el único click extra, en pista. El alta de 10 s
  se mantiene.

### Tablas nuevas / cambios (todas aditivas, reversibles, con ROLLBACK)
| Tabla | Cambio | Propósito |
|---|---|---|
| `participant_items` | **Alimentar** (auto desde packageType + suplementos) | AR + desglose ingresos |
| `channel_product_prices` | **NUEVA** (canal × producto → precio neto, active) | Precio neto por plataforma; autorrelleno de `unit_price` |
| `cash_close` | **NUEVA** (una por jornada) | Cierre de caja por método: esperado vs. contado + descuadre/nota |
| `staff_settlements` | **NUEVA** | Devengado por persona/periodo + estado pagado/pendiente |
| `instructors` → roles | Generalizar | Tarifa propia por rol: tándem, cámara (menos), plegador, piloto |
| `expenses` | Extender: `status`, `due_date`, `paid_on` | AP proveedores con vencimiento/estado |
| `customer` | **NUEVA** (tel/email) | CRM-lite; FK desde el principio aunque UI sea mínima |

## Sprints (ejecución; cada uno = rama → PR a main que mergea Alejandro)

Cada sprint entrega en este orden de tareas: **migración → tipos → motor → UI →
verificación (checks + build + tsc) → docs**. TaskCreate por entregable al empezar cada
sprint; marcar `completed` al terminar cada uno.

**Sprint 1 — Itemización + AR (la clave). Rama `feature/treasury-itemization-ar`.**
- Migración: `channel_product_prices` + seed DIRECT desde `products.base_price`.
- Auto-itemización: al confirmar lead / dar de alta participante, generar
  `participant_items` desde `packageType` (mapa arriba) con `unit_price` por canal.
  Punto de enganche: `confirmLead`/alta en `leads.ts`/`participant.ts` + UI
  `AddParticipantDrawer`.
- AR derivado: `saldo = Σ(items) − Σ(payments)`. Badge de saldo en la fila del manifiesto;
  vista "Cobros" (AR) en Administración, separando **pendiente de cliente** vs **pendiente
  de plataforma**.
- Verificar que el desglose de ingresos deja de mostrar 100% "Sin desglose"; checks P&L en
  verde (invariante Σ categorías === revenueTotal intacto).

**Sprint 2 — Cierre de caja diario (máximo ROI). Rama `feature/treasury-cash-close`.**
- `cash_close` (por método: efectivo/tarjeta/bizum esperado vs. contado) + descuadre y nota.
- Cierre desde el manifiesto (donde ya trabaja el staff); vista "Caja" en Administración.
- El "esperado" se deriva de `payments` del día (una sola entrada).

**Sprint 3 — Reservas-CRM: edición inline + cancelar/reubicar. Rama `feature/reservations-crm`.**
- `updateLead(leadId, changes)` en `leads.ts` (fullName, phone, email, weight,
  preferredTime) + casillas **editables inline** en `ReservationRow` / manifiesto (patrón
  CRM). Sienta base de la entidad `customer`.
- `cancelFlight(flightId)` + `moveParticipants(fromFlight, toFlight, ids)` con validación
  de hueco (reusa lógica `reservations_assign_seat`/`availability-engine`).
- **Reubicación de fin de semana cancelado** (caso real de Raúl): cuando se cancela un día,
  ofrecer reubicar sus participantes en huecos de **otros días que quedan** (no aplazar
  todos al siguiente finde) — UI de reubicación por grupo sobre el calendario de
  disponibilidad. Nota cruzada: informar al proyecto chatbot de esta operativa.

**Sprint 4 — Nómina de personal operativo. Rama `feature/treasury-staff-payroll`.**
- `instructors`→roles con tarifa propia; atribución por operación (quién hizo cada rol,
  dato operativo ya capturable); `staff_settlements` (devengado/pagado por persona/periodo).
- Reconciliar con el coste de personal del P&L; vista "Pagos › Personal".

**Sprint 5 — AP proveedores + posición de caja. Rama `feature/treasury-payables-cashpos`.**
- Extender `expenses` (status/due_date/paid_on); vista "Pagos › Proveedores".
- Posición de caja en el tiempo: `AR (cliente+plataforma) + caja − AP`, usando payment
  terms de plataforma (~1 semana, a confirmar).

**Sprint 6 (opcional/futuro) — CRM-lite + bonos propios. Rama `feature/crm-lite-vouchers`.**
- Consolidar entidad `customer` (aviso "cliente ya visto"); bonos regalo **propios** de
  iJump (distintos de los bonos de plataforma). Depende de decisión de negocio 5.3.

## Área de UI
Nueva sección de nav **"Administración"** (uso de Raúl/administrativa) con pestañas: **P&L**
(la actual `/finanzas`, devengo), **Caja**, **Cobros**, **Pagos** (Personal/Proveedores),
**Bonos** (futuro). La captura diaria se queda en el **Manifiesto**. Diseño OKLCH
light-mode, tokens semánticos, probar a ~820px (tablet). AGENTS.md del repo: Next.js 16 con
breaking changes — leer `node_modules/next/dist/docs/` antes de escribir código.

## Datos pendientes de Raúl (no bloquean el arranque de Sprint 1)
- Precios netos por plataforma × producto (Groupon/Smartbox/Wonder Box/Jumping/Freedom).
- Payment terms por plataforma (¿~1 semana? confirmar) → posición de caja.
- Tarifa instructor de cámara (cobra menos), plegador (¿por pliegue/salto?), piloto (¿por
  vuelo/jornada?, ¿tercero o interno?). Ver `docs/finanzas/PREGUNTAS_NEGOCIO_FINANZAS.md`.
- Cuota real préstamo avión, seguro, SWOOPWARE (hoy a 0 en `expense_categories`).

## Verificación (por sprint)
- `node_modules/.bin/jiti src/lib/finance/__pnl_check.mts` (regresión P&L) y
  `__gastos_check.mts` en verde.
- `npx tsc --noEmit` y `npm run build` limpios.
- Preview local `npm run dev`: alta de participante genera `participant_items` correctos;
  badge de AR aparece; desglose de ingresos deja de ser 100% "Sin desglose"; cierre de
  caja cuadra esperado vs. contado.
- Migraciones aditivas con ROLLBACK; se aplican **a mano en Supabase tras el merge**
  (proyecto `ojngrplnuhcenulfnfps`, lo hace Alejandro). Regenerar `database.types.ts`.

## Ramas y coordinación

- **Base de las ramas: `main`.** El PR #41 (`docs/reorganize-and-treasury-proposal`) se
  mergea primero; cada rama de sprint (`feature/...`) parte de `main` ya actualizado
  (`git checkout main && git pull`), como marca el flujo habitual del `CLAUDE.md` del
  repo. (La instrucción original de arrancar desde la rama del PR era solo para la
  exploración de esta sesión, antes de que #41 se mergeara — ya no aplica.)
- **Un sprint = una rama = un PR.** Alejandro mergea cada uno y aplica las migraciones a
  mano en Supabase tras el merge (checklist ya documentado en `CLAUDE.md` §Migraciones).
- **Coordinación de archivos:** los Sprints 1 y 3 tocan `leads.ts` y `participant.ts`
  (itemización automática al confirmar/dar de alta vs. `updateLead`/edición inline).
  Conviene secuenciarlos en el tiempo (no en paralelo) o coordinar quién toca qué antes de
  empezar, para no pisarse en el mismo archivo. El resto de sprints toca superficies
  distintas (`cash_close`, `staff_settlements`, `expenses`) y puede ir sin fricción.
- **Sprint 1 no está bloqueado por los datos pendientes de Raúl** (§Datos pendientes): el
  seed `channel_product_prices` para DIRECT sale de `products.base_price` ya existente;
  los precios netos por plataforma se cargan en cuanto lleguen, sin bloquear el arranque.
- Actualizar checkboxes en `tasks/2026-07-modulo-administracion-tesoreria.md` según avance
  cada sprint; al completar el plan entero, moverlo a `tasks/_archivado/` con sección de
  review (convención del repo, ver `CLAUDE.md` §Nombrado y archivado).
