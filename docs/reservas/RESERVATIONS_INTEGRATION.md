# Sistema de Reservas — Guía de integración (post-merge, R1–R10)

> Plantilla: `docs/finanzas/FINANCE_V2_INTEGRATION.md`. Este documento es la referencia para entender qué se construyó, cómo revertir cualquier pieza si hace falta, y qué tener en cuenta antes de extender el módulo (Stripe, multi-participante, etc.).
>
> Para el contrato de la API que usa el chatbot, ver `docs/reservas/BOT_API_CONTRACT.md`. Para el detalle fase por fase con lo que se probó en cada una, ver `docs/reservas/CHECKLIST.md`.

---

## 1. Resumen en una frase

Una reserva (**lead**) es la misma fila de `participants` que luego aparece en el manifest — nunca hay una tabla separada de "leads" ni migración de datos: lo único que cambia al confirmar es que se le asigna `flight_id` y fechas reales. Todo el módulo es **aditivo** sobre el esquema existente; no se tocó ni se borró nada del manifest operacional.

**Pago online (Stripe) está fuera de alcance** en todo el módulo — por eso `POST /api/bot/v1/reservations` confirma directamente (o deja en tentativa) en una sola llamada, sin paso intermedio de `AWAITING_PAYMENT`.

---

## 2. Cambios de base de datos (aditivos) + cómo revertir

Migraciones, en orden:

| Migración | Qué hace |
|---|---|
| `20260622000000_reservations.sql` | Base: columnas de lead en `participants` (`lead_status`, `preferred_date`, `preferred_time`, `confirmed_date`, `confirmed_time`, `deposit_paid`, `channel`, `created_by`, `token`), columnas de canal/contacto en `reservation_groups`, tablas nuevas `api_keys`, `api_rate_limits`, `business_settings` (+ seed), RLS en las 3 tablas nuevas. |
| `20260623000000_reservations_assign_seat.sql` | Función `reservations_assign_seat(lead_id, date)` — asignación de asiento concurrency-safe (`SELECT ... FOR UPDATE`). |
| `20260624000000_reservations_assign_seat_fix_time.sql` | Fix: la función ignoraba `preferred_time` y agrupaba todo a la hora por defecto. |
| `20260625000000_reservations_assign_seat_no_dupe_time.sql` | Fix: evita dos vuelos a la misma hora + reordena `order_index`/`flight_number` del día por hora de salida tras cada confirmación. |
| `20260626000000_reservations_assign_seat_retry_flight_number.sql` | Hardening: el insert de un vuelo nuevo reintenta con `MAX(flight_number)+1` recalculado en vez de confiar en un único `COUNT` (síntoma: colisión de `flight_number` en producción). |
| `20260627000000_flights_flight_number_deferrable.sql` | **Causa real** del bug anterior: el reordenamiento cronológico hace un `UPDATE` que intercambia `flight_number` entre filas en una sola statement — con la constraint `UNIQUE(operational_day_id, flight_number)` en modo `NOT DEFERRABLE` (el default), Postgres la valida fila a fila y revienta a mitad del swap aunque el resultado final sea válido. Se cambia la constraint a `DEFERRABLE INITIALLY DEFERRED`. |
| `20260628000000_bump_rate_limit.sql` | Función `bump_rate_limit(api_key_id, limit_per_min)` — ventana fija de 60s, upsert atómico sobre `api_rate_limits`, usada por la API del bot. |

**No** se modificó ni borró nada de `flights`, `operational_days`, `instructors`, `payments`, ni del resto del manifest.

**Cómo revertir:** cada migración lleva su bloque `ROLLBACK` comentado al final. Para deshacer todo el módulo de una vez, revertirlas en orden inverso al de la tabla — la única con dependencia real entre sí es la cadena de `reservations_assign_seat` (cada una es `CREATE OR REPLACE`, así que solo importa cuál quede aplicada última).

---

## 3. Cambios de código por capa

### Motor puro (sin I/O)
- `src/lib/availability/availability-engine.ts` — `isOperatingDay`, `computeDaySlots`, `classifyDate`. La regla de clasificación es una **ventana rodante de `CONFIRMABLE_WINDOW_DAYS` (30) días desde hoy**, no mes natural — ver corrección en `RESERVAS_MODULE_PLAN_v1.md` (el diseño original usaba "mes actual vs mes futuro", se cambió tras un bug real encontrado en pruebas).
- `src/lib/availability/__availability_check.mts` — check de regresión vía `jiti` (patrón `__pnl_check.mts`).

### Server Actions
- `src/lib/actions/availability.ts` — `getPolicy`, `getDayAvailability`, `getMonthAvailability`, `listNextAvailableSlots`. Exporta `DbClient` (alias de `SupabaseClient<Database>`).
- `src/lib/actions/leads.ts` — `createLead`, `confirmLead`, `rescheduleLead`, `cancelLead`, `listLeads`, `getLeadByIdOrToken`, `handleWeatherCancellation`, `promoteTentativeLeads`, `countPendingLeads`, `setPreferredDate`.
- `src/lib/actions/participant.ts` — `createParticipant` relajado a `flightId: string | null` (un lead es un participant con `flight_id = NULL`) + `freeSeat`.

**Patrón `DbClient` inyectable:** `getPolicy`, `getDayAvailability`, `listNextAvailableSlots`, `confirmLead`, `promoteTentativeLeads`, `createParticipant` y `createLead` aceptan un cliente Supabase opcional como último/penúltimo parámetro. Por defecto usan el cliente de sesión (cookies, `src/lib/supabase/server.ts`) — pero el cron y la API del bot **no tienen sesión de usuario**, así que inyectan el service client (`src/lib/supabase/service.ts`, salta RLS). Si añades una función nueva que necesite ejecutarse desde un contexto sin cookies, sigue este mismo patrón en vez de asumir `createClient()`.

### API del bot
- `src/lib/api/auth.ts` — `authenticateBotRequest(request, scope)`: valida `X-API-Key` (sha256 contra `api_keys`), scope, actualiza `last_used_at`.
- `src/lib/api/rate-limit.ts` — `enforceRateLimit(client, apiKeyId, limitPerMin)`: llama a `bump_rate_limit`, devuelve 429 con `Retry-After` si corresponde.
- `src/app/api/bot/v1/availability/route.ts`, `availability/day/route.ts`, `reservations/route.ts`, `reservations/[idOrToken]/route.ts`.
- Contrato completo: `docs/reservas/BOT_API_CONTRACT.md`.

### Cron
- `src/app/api/cron/promote-leads/route.ts` — `GET`, autenticado vía `CRON_SECRET` (Vercel lo inyecta automáticamente como `Authorization: Bearer` cuando la env var existe en el proyecto). Llama a `promoteTentativeLeads` con el service client.
- `vercel.json` — cron diario a las 06:00 UTC.

### UI
- `src/app/(dashboard)/reservas/page.tsx` + `ReservationsView.tsx` (tabs Pendientes/Confirmadas/Canceladas) + `ReservationRow.tsx` + `ReservationStatusBadge.tsx` (`AvailabilityBadge`, `LeadStatusBadge`).
- `ConfirmReservationModal.tsx`, `RescheduleReservationModal.tsx`, `CompleteLeadModal.tsx`, `WeekendAvailabilityCalendar.tsx`.
- `AddParticipantDrawer.tsx` extendido con `mode?: 'participant' | 'lead'` — un solo componente para alta manual desde el manifest o desde `/reservas`.
- `AppSidebar.tsx` — entrada "Reservas" con badge numérico de leads pendientes (`countPendingLeads`).
- `ParticipantRow.tsx` — badge discreto "Web"/"Bot" cuando `channel != 'STAFF'` y `lead_status = 'CONFIRMED'`.
- `DayHeader.tsx` — marcar el día `weather_status = 'CANCELLED'` dispara `handleWeatherCancellation` automáticamente.

---

## 4. Decisiones de arquitectura a recordar

- **Una entidad, no dos tablas.** Nunca crear una tabla `leads` separada — un lead es `participants` con `flight_id IS NULL` y `lead_status` no nulo.
- **Ventana rodante, no mes natural.** Ver §3. Si se cambia `CONFIRMABLE_WINDOW_DAYS`, no hay que tocar nada más — `confirmLead`, `promoteTentativeLeads` y el bot API leen todos de la misma función `classifyDate`.
- **Disponibilidad a nivel de día PARA LA FECHA, con overlay de hora para el lead.** `classifyDate` clasifica la fecha por capacidad total del día (`max_flights_per_day` × `max_clients_per_flight`). Sobre eso, `classifyLeadSlot` aplica un overlay por hora (jul-2026): si el lead pidió una **hora concreta** y el vuelo de esa hora está lleno, la reserva pasa a `UNAVAILABLE` → se muestra como **Conflicto** y obliga a reagendar/cambiar la hora, aunque el día tenga hueco en otras horas. Un lead "cualquier hora" (`preferred_time` NULL) sigue siendo puramente a nivel de día. El staff todavía puede crear dos vuelos a la misma hora **a mano** desde el manifest; el overlay solo gobierna la confirmación automática de reservas.
- **Sin Stripe en ningún punto.** `deposit_paid` existe como columna pero el staff lo marca a mano cuando confirme el ingreso (transferencia/efectivo) — no hay webhook ni checkout.
- **`reservations_assign_seat` nunca reasigna a un vuelo de otra hora** solo porque tenga hueco — une al vuelo de la hora exacta solicitada, o crea uno nuevo si a esa hora aún no hay vuelo. Si a la hora exacta ya existe un vuelo y está lleno, una petición de **hora concreta** devuelve `NO_SEATS_AVAILABLE` (conflicto) en vez de crear un vuelo en la hora siguiente (migración `20260716`); solo la petición "cualquier hora" crea/avanza a la siguiente hora libre. Regla venida de correcciones explícitas tras pruebas reales; no revertirla sin que el usuario lo pida.
- **`reservations_assign_seat` siempre re-secuencia** `order_index`/`flight_number` del día completo tras cada confirmación, para que el manifest quede en orden cronológico de salida sin importar el orden de confirmación.

---

## 5. Pendiente / fuera de alcance (documentado, no es deuda oculta)

- Pago online (Stripe), importe de depósito, política de reembolso — módulo completo excluido, decisión explícita del usuario.
- Reservas de grupo (varios participantes) en una sola llamada del bot API — el bot crea un lead por llamada.
- Reagendar/cancelar una reserva vía bot API — solo el staff, manualmente, desde `/reservas`.
- Conflicto de horario exacto (dos leads pidiendo la misma hora) — deferido explícitamente, ver §4.
- `CRON_SECRET` debe añadirse en las variables de entorno de Vercel (Vercel lo inyecta solo si existe la env var con ese nombre exacto).
