# Revisión CRM del módulo de Reservas — julio 2026

**Autor:** sesión de orquestación con Ricardo (2026-07-04).
**Rol:** revisión como experto en CRM y gestión de reservas/leads, sobre el código real
de `main` (post PRs #42/#44/#45/#47).
**Alcance:** solo análisis y roadmap priorizado. Nada de este documento está
implementado salvo que se indique.

---

## 1. Contexto operativo (contra el que se evalúa todo)

- Centro de paracaidismo tándem, operación de fin de semana, máx. 2 clientes/vuelo y
  ~10 vuelos/día. El **manifiesto es el system of record del día**; reservas es el
  inicio del pipeline.
- **Los leads los gestiona Raúl por teléfono y WhatsApp** (a mano, con su móvil). La
  administrativa gestiona reservas entrantes. El **chatbot** (proyecto
  `chatbot/` — WhatsApp + widget web) se conectará como tercer canal vía la API del bot
  v1 ya existente (`/api/bot/v1/*`).
- Ya detectado en el lado chatbot (jul 2026): hubo ~8 leads sin seguimiento por
  drop-off en el flujo de escalado a humano. El riesgo real de este negocio no es el
  overbooking (el software ya lo impide), es el **lead que se enfría**.

## 2. Lo que ya está bien (no tocar, es la base)

| Capacidad | Estado |
|---|---|
| Pipeline de estados (`NEW → TENTATIVE/CONFIRMED → RESCHEDULE_NEEDED/CANCELLED/NO_SHOW`) con transiciones en código, no en la cabeza de nadie | ✅ Sólido |
| Asignación de asiento concurrency-safe (`reservations_assign_seat`) + ventana rodante de 30 días + cron `promote-leads` para tentativas | ✅ Sólido |
| Cancelación meteorológica de día completo → liberación masiva → **reubicación grupal** repartiendo entre días con hueco (PR #45) | ✅ Cubre el caso real de Raúl |
| Cancelar vuelo individual = mover ocupantes dentro del día (sin echar a nadie del pipeline) + DnD con validación de capacidad | ✅ Correcto operativamente |
| Edición inline de datos del lead en `/reservas` y en el manifiesto (una sola entrada de datos) | ✅ |
| Trazabilidad económica: fuente → itemización automática → AR por cliente/plataforma → cierre de caja | ✅ Diferencial frente a cualquier CRM genérico |
| API bot v1 (disponibilidad, crear reserva, consultar estado) con contrato documentado | ✅ Lista para el chatbot |

Veredicto general: la "cañería" reservas↔manifiesto es mejor que la de la mayoría de
CRMs verticales comerciales. Lo que falta no es fontanería: es **gestión del embudo**.

## 3. Gaps priorizados

### P0 — El embudo de leads no tiene dueño visible ✅ EJECUTADO (mini-sprint CRM P0, rama `feature/crm-p0-aging-dedupe`)

- **Síntoma:** un lead `NEW` sin fecha, o con fecha pero sin confirmar, no aparece en
  ninguna bandeja de trabajo con urgencia. Nadie lo "persigue"; depende de la memoria
  de Raúl. Es exactamente el patrón del incidente de los ~8 leads del chatbot.
- **Propuesta:** vista de trabajo en `/reservas` (o cabecera del tab Pendientes) con
  **aging**: "N leads sin tocar hace >48h", ordenación por antigüedad, y un campo
  `last_contact_at` que se actualice al editar/contactar. Cero automatización de
  mensajes todavía: primero que el humano VEA la cola.
- **Esfuerzo:** bajo (1 columna + 1 vista). **Impacto:** directo en ventas.

### P0 — Deduplicación por teléfono antes de que llegue el bot ✅ EJECUTADO (mini-sprint CRM P0, misma rama; contrato bot v1.1)

- **Síntoma:** no hay entidad cliente ni matching. Hoy el duplicado lo evita Raúl de
  memoria. Cuando el chatbot cree reservas solo, **creará duplicados garantizado**
  (mismo cliente llama Y escribe al bot).
- **Propuesta mínima (sin entidad `customer` todavía):** normalizar teléfono al
  guardar (+34, sin espacios) y, en `createLead` + API bot, buscar participante
  activo con el mismo teléfono → devolver aviso "posible duplicado de X (sáb 12 jul)"
  en la UI, y en la API bot devolver el lead existente en vez de crear otro (idempotencia
  por teléfono+fecha). La entidad `customer` completa sigue siendo Sprint 6.
- **Esfuerzo:** medio-bajo. **Impacto:** imprescindible ANTES de conectar el chatbot.

### P1 — Canal de contacto ≠ fuente de venta ✅ EJECUTADO (rama `feature/crm-reactivacion-no-show`)

- **Síntoma:** `channel` (WEB_BOT | WHATSAPP_BOT | STAFF) mezcla poco y
  `reservation_source` (DIRECT/GROUPON/...) es la plataforma de venta. Falta el matiz
  "STAFF por teléfono" vs "STAFF por WhatsApp" que Raúl sí distingue. Sin eso no se
  puede responder "¿cuántas reservas nos trae WhatsApp vs teléfono vs bot?" — la
  pregunta de marketing más básica.
- **Propuesta:** ampliar `channel` con `STAFF_PHONE` / `STAFF_WHATSAPP` (o un subcampo),
  seleccionable en el alta con default sensato. Es 1 click más SOLO si el staff quiere
  el dato; default = STAFF como hoy.
- **Esfuerzo:** bajo. Nota: es un enum → misma excepción de reversibilidad que
  `reservation_source` (issue #43); agrupar con la próxima migración de enums.
- **As-built:** `channel` resultó ser `TEXT` + `CHECK`, no un enum nativo de Postgres
  (a diferencia de `reservation_source`) — la migración
  `20260705000000_channel_staff_detail.sql` es un `DROP/ADD CONSTRAINT` normal y
  reversible, sin la excepción de #43. Selector añadido en `AddParticipantDrawer.tsx`
  (solo altas manuales de leads), default `STAFF`.

### P1 — Recordatorios pre-salto (donde el chatbot brilla)

- **Síntoma:** la confirmación de asistencia y el aviso de meteo son llamadas manuales
  de Raúl. Es la tarea más automatizable de toda la operación.
- **Propuesta:** cuando el chatbot esté conectado: T-48h "confirma asistencia + peso +
  llega 45 min antes" y T-24h aviso si `weather_status=MARGINAL`. El software ya tiene
  todos los datos; el envío es del lado chatbot/n8n. **Definir en el contrato bot v2**
  un endpoint de lectura "reservas confirmadas de la fecha X" (o reutilizar el
  existente con filtro).
- **Esfuerzo:** bajo en el software (dato ya existe), medio en el chatbot.

### P1 — NO_SHOW y CANCELLED son agujeros negros ✅ EJECUTADO (rama `feature/crm-reactivacion-no-show`)

- **Síntoma:** son estados terminales. Un no-show con bono de plataforma ya pagado es
  dinero de iJump sin coste — recuperarlo es margen puro. Nadie los re-contacta.
- **Propuesta:** en el tab Canceladas, botón "Reactivar" (→ NEW con nota automática) y
  contador de no-shows recuperables del mes. Más adelante, campaña de reactivación vía
  chatbot.
- **Esfuerzo:** bajo.
- **As-built:** `reactivateLead()` en `leads.ts` pone `lead_status = 'NEW'` +
  nota automática + `last_contact_at`. Botón "Reactivar" en el tab Canceladas de
  `/reservas` (`ReservationRow.tsx`) y contador de no-shows recuperables del mes
  (`ReservationsView.tsx`). Campaña de reactivación vía chatbot sigue pendiente,
  fuera de alcance de este cambio.
- **As-built 2 (rama `feature/crm-lead-management`, 2026-07-07):** auditoría posterior
  reveló que `lead_status = 'NO_SHOW'` era **inalcanzable** — nada lo escribía: marcar
  no-show en el manifest solo tocaba `operational_status`, y el Reactivar de arriba no
  tenía datos. Cerrado con doble mecanismo: sync inmediato manifest→lead
  (`syncLeadStatusForOperationalChange` en `participant.ts`, con revert a CONFIRMED si
  el staff se equivocó) + barrido diario `sweepOverdueNoShows` (cron `promote-leads`)
  para confirmados de fecha pasada con manifest sin tocar. `reactivateLead` ahora
  además libera el asiento (`flight_id NULL`) y limpia la confirmación caducada.

### Hallazgos adicionales (auditoría 2026-07-07, rama `feature/crm-lead-management`) ✅ EJECUTADOS

- **`deposit_paid` era una columna muerta:** ningún componente la leía ni escribía.
  Resuelto: toggle manual en la ficha de lead (`LeadSheet.tsx`, action
  `setDepositPaid`) + auto-activación al registrar un pago stage RESERVA
  (`createPayment`). El bot ya la leía vía `getLeadByIdOrToken` — ahora tiene valor real.
- **Badge "Grupo" siempre visible (bug de datos estructural):** `createParticipant`
  crea un grupo-de-1 para TODO alta manual porque `source` (obligatorio en el form)
  dispara la creación del grupo. El grupo-de-1 es el portador de `source` para
  finanzas (mixBySource, AR `owedBy`) — NO se tocó la creación. Fix de UI: badge solo
  con `groupSize >= 2` o `payer_name` (count real embebido en `listLeads`).
- **Pagos invisibles desde `/reservas`:** `createPayment` funciona para leads sin
  vuelo (verificado: la FK no depende de `flight_id`) pero la única UI estaba en el
  manifest. Resuelto: `PaymentManager` extraído a `shared/` y reutilizado en la ficha
  de lead. Decisión consciente: AR y cierre de caja NO se tocaron (sus joins excluyen
  leads sin vuelo) — un depósito pre-vuelo entra en AR/caja al confirmarse el lead.
  Riesgo residual documentado: depósito en efectivo pre-vuelo no aparece en el cierre
  de caja de ese día.
- **UI `/reservas` reestructurada como tabla CRM:** columnas Cliente / Salto / Estado /
  Pago / Contacto con cabecera, ficha de lead al clic (`LeadSheet.tsx`), alerta de
  leads fríos visible desde cualquier tab + badge rojo en el sidebar
  (`countLeadAttention`), y deep-link "Manifest" desde reservas confirmadas al
  participante en el manifest del día (`/[date]?highlight=<id>`).
- **Pendiente futuro (sesión de conexión del chatbot):** notificación externa a Raúl
  (WhatsApp vía n8n) cuando haya leads fríos — puede consultar los leads >48h
  reutilizando la API del bot con un scope de lectura nuevo.

### P2 — Métricas de embudo

Conversión NEW→CONFIRMED por canal y por fuente, tiempo medio de confirmación, leads
perdidos por "sin hueco". Una card en `/administracion`. Solo tiene sentido cuando
`channel` distinga teléfono/WhatsApp/bot (P1 primero).

### P2 — Lista de espera

Para días llenos (verano): estado `WAITLIST` o flag sobre TENTATIVE + aviso automático
cuando la reubicación grupal o una cancelación libere hueco. Hoy el hueco liberado se
pierde si nadie lo recuerda.

### P2 — Entidad `customer` + "cliente ya visto"

Ya prevista (Sprint 6, decisión 5.3). La dedupe P0 por teléfono es el puente hasta
entonces y su implementación natural (el matching por teléfono ES el embrión de la
entidad).

## 4. Interconexión con el chatbot (guardrails para la sesión de conexión)

1. **Idempotencia por teléfono** (P0 arriba): el bot NUNCA crea un lead si existe uno
   activo con el mismo teléfono para fecha próxima; devuelve el existente.
2. **El bot escribe leads `NEW` con `channel=WHATSAPP_BOT/WEB_BOT`** y entran en la
   MISMA bandeja `/reservas` — nada de colas paralelas. El humano ve todo junto (con
   el aging del P0, los del bot no se enfrían).
3. **Escalado a humano = nota en el lead** (campo notes) + `last_contact_at`, para que
   el traspaso bot→Raúl no pierda contexto (la causa raíz del incidente de julio).
4. **Disponibilidad por horas:** el nuevo `getDayOccupancy(date)` (retoques jul 2026)
   sirve tal cual para que el bot ofrezca horas concretas con hueco, no solo días.
5. Reglas de negocio en UN sitio: el bot consume `availability-engine` vía API; no
   duplicar ventanas/capacidades en la KB del chatbot (la KB describe, no calcula).

## 5. Roadmap sugerido (orden de ejecución)

| # | Ítem | Prioridad | Esfuerzo | Cuándo |
|---|---|---|---|---|
| 1 | Aging de leads + `last_contact_at` | P0 | Bajo | ✅ Ejecutado (mini-sprint CRM P0, 2026-07-04) |
| 2 | Dedupe por teléfono (UI + API bot) | P0 | Medio-bajo | ✅ Ejecutado (mini-sprint CRM P0, 2026-07-04) — pendiente trasladar al chatbot |
| 3 | `channel` teléfono/WhatsApp | P1 | Bajo | ✅ Ejecutado (`feature/crm-reactivacion-no-show`, 2026-07-07) |
| 4 | Reactivar NO_SHOW/CANCELLED | P1 | Bajo | ✅ Ejecutado (`feature/crm-reactivacion-no-show`, 2026-07-07) |
| 5 | Recordatorios T-48/T-24 | P1 | Medio | Sesión de conexión del chatbot |
| 6 | Métricas de embudo | P2 | Medio | Tras 4-6 semanas de datos con #3 |
| 7 | Waitlist | P2 | Medio | Antes del pico de verano 2027 |
| 8 | Entidad `customer` | P2 | Alto | Sprint 6 (ya previsto) |

---

*Actualizar este doc cuando se ejecute cada ítem; los ítems 2 y 5 deben reflejarse
también en el contrato de la API del bot (`docs/reservas/BOT_API_CONTRACT.md`) y en el
proyecto del chatbot.*
