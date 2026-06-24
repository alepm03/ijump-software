# Checklist — Módulo de Reservas (Leads → Manifest)

> Fuente de verdad: [`RESERVAS_MODULE_PLAN_v1.md`](./RESERVAS_MODULE_PLAN_v1.md).
> Stripe / pago online **fuera de alcance** en este checklist (ver §13 del plan).
> Marca cada ítem `[x]` al completarlo. No agrupar commits de fases distintas.

---

## R1 — Base (fixes + migración + tipos) ✅ Mergeado (PR #23)

Rama: `feature/reservations-base`

- [x] Variable de entorno ya estaba correcta (`SUPABASE_SERVICE_ROLE_KEY` sin prefijo `NEXT_PUBLIC_`) — sin fix necesario
- [x] Fix `src/proxy.ts`: early-return para `pathname.startsWith('/api/')` y `/reserva/`
- [x] Migración `supabase/migrations/20260622000000_reservations.sql`:
  - [x] `ALTER TABLE participants` (lead_status, preferred_date, preferred_time, confirmed_date, confirmed_time, deposit_paid, channel, created_by, token)
  - [x] Constraints `CHECK` (lead_status, channel) + `UNIQUE` (token)
  - [x] Índices parciales (lead_status, preferred_date, confirmed_date)
  - [x] `ALTER TABLE reservation_groups` (contact_phone, contact_email, channel, created_by)
  - [x] Tabla `api_keys`
  - [x] Tabla `api_rate_limits`
  - [x] Tabla `business_settings` + seed inicial (pendiente confirmar valores reales con Raúl)
  - [x] RLS en las 3 tablas nuevas + policies
  - [x] Bloque `ROLLBACK` comentado al final
- [x] Migración aplicada en Supabase (producción del proyecto `ojngrplnuhcenulfnfps`) — software existente verificado sin roturas
- [x] Regenerado `src/lib/supabase/database.types.ts`
- [x] Extendido `src/types/domain.ts`: `LeadStatus`, `Channel`, `DateClass`, `AvailabilityPolicy`, `DaySlots`, `BusinessSetting`, `ApiKey`, `LeadWithDetails`, `Participant`/`ReservationGroup` extendidos
- [x] Mapper `operational-day.ts` actualizado para exponer los nuevos campos
- [x] `npx tsc --noEmit` limpio
- [x] PR #23 a `main` — mergeado

---

## R2 — Motor de disponibilidad ✅

Rama: `feature/reservations-availability-engine`

- [x] `src/lib/availability/availability-engine.ts`:
  - [x] `AvailabilityPolicy`, `DayLoad`, `DaySlots`, `DateClass` (tipos, re-exportados desde `domain.ts`)
  - [x] `isOperatingDay(date, policy)`
  - [x] `computeDaySlots(load, policy)`
  - [x] `classifyDate(target, today, slots)` → `CONFIRMABLE | TENTATIVE_ONLY | UNAVAILABLE | NOT_OPERATING`
- [x] `src/lib/availability/__availability_check.mts` (check de regresión vía jiti, patrón `__pnl_check.mts`):
  - [x] Caso fin de semana vs entre semana
  - [x] Tope 2 participantes/vuelo
  - [x] Límite `max_flights_per_day`
  - [x] Meteo cancelada → 0 plazas
  - [x] `classifyDate` mes actual vs mes futuro (⚠ superado, ver fix `fix/availability-rolling-window`: ahora es ventana rodante de 30 días, no mes natural — bug encontrado por el usuario: pedir el finde siguiente cruzando un cambio de mes daba TENTATIVE_ONLY aunque solo faltaran días)
  - [x] Día lleno → `UNAVAILABLE`
  - [x] Todas las aserciones PASS (`node_modules/.bin/jiti src/lib/availability/__availability_check.mts`)
- [x] `src/lib/actions/availability.ts` (wrappers con BD):
  - [x] `getPolicy()` (lee `business_settings`, con defaults si la tabla está vacía)
  - [x] `getDayAvailability(date)` (día sin `operational_day` = vacío/abierto)
  - [x] `getMonthAvailability(yearMonth)`
  - [x] `listNextAvailableSlots({ fromDate, limit, maxDaysToScan })`
- [ ] Confirmar con Raúl: `operating_weekdays` y `max_flights_per_day` reales → ajustar seed de `business_settings` si hace falta (pendiente, no bloquea el merge)
- [x] `npx tsc --noEmit` limpio · lint sin nuevos errores
- [ ] PR a `main`

---

## R3 — Ciclo de vida del lead ✅

Rama: `feature/reservations-lifecycle`

- [x] `src/lib/actions/participant.ts`:
  - [x] Relajado `createParticipant(flightId: string | null, data)` (ahora también devuelve `id`)
  - [x] Helper `freeSeat(id)` (set `flight_id = NULL`)
- [x] Función Postgres `reservations_assign_seat(lead_id, date)` con `SELECT ... FOR UPDATE` sobre vuelos del día (`supabase/migrations/20260623000000_reservations_assign_seat.sql`, aplicada en Supabase)
- [x] `src/lib/actions/leads.ts`:
  - [x] `createLead(input)`
  - [x] `confirmLead(leadId, date)` → llama a la RPC, gestiona CONFIRMABLE vs TENTATIVE_ONLY vs UNAVAILABLE/NOT_OPERATING
  - [x] `rescheduleLead(leadId, newDate)`
  - [x] `cancelLead(leadId)`
  - [x] `listLeads(filter)`
  - [x] `handleWeatherCancellation(dayId)`
  - [x] `promoteTentativeLeads(today?)`
- [x] Probar concurrencia: dos confirmaciones simultáneas al mismo último asiento → verificado contra Supabase real, exactamente 1 éxito + 1 `NO_SEATS_AVAILABLE`
- [x] `npx tsc --noEmit` limpio · lint sin nuevos errores
- [ ] PR a `main`

---

## R4 — UI: página `/reservas` ✅

Rama: `feature/reservations-ui-list`

- [x] `src/app/(dashboard)/reservas/page.tsx` (Server Component; nota: convención real del repo usa `src/components/operational/` para los componentes, no `src/app/reservas/components/`)
- [x] `src/components/operational/ReservationsView.tsx` (segmented control Pendientes / Confirmadas / Canceladas con counts, patrón `FinancePeriodSelector`)
- [x] `src/components/operational/ReservationRow.tsx` (Confirmar/Cancelar funcionales; Reagendar/Completar placeholder hasta R5/R6)
- [x] `src/components/operational/ReservationStatusBadge.tsx` (`AvailabilityBadge`: Libre / Tentativa / Conflicto / No operativo / Sin fecha; `LeadStatusBadge` para tabs Confirmadas/Canceladas)
- [ ] Soporte visual de grupos: solo badge simple "Grupo" por ahora — expandir miembros queda pendiente (no bloqueante, mejora futura)
- [x] Seguir `docs/DESIGN_SYSTEM.md` (tokens semánticos, badges pastel permitidos por convención)
- [x] Enlace "Reservas" añadido en `AppSidebar` (entre "Hoy" y "Finanzas") — adelanta parte de R7
- [x] Verificado visualmente por el usuario con leads de prueba sembrados y limpiados después (3 escenarios: libre, tentativa, sin fecha)
- [x] `npx tsc --noEmit` limpio · lint sin nuevos errores
- [ ] PR a `main`

---

## R5 — UI: acciones de confirmación/reagenda ✅

Rama: `feature/reservations-ui-actions`

- [x] `ConfirmReservationModal.tsx` (Casos A y B del plan)
- [x] `RescheduleReservationModal.tsx` (Caso C, usa `rescheduleLead`)
- [x] `WeekendAvailabilityCalendar.tsx` (verde CONFIRMABLE / ámbar TENTATIVE_ONLY / gris UNAVAILABLE-NOT_OPERATING)
- [ ] Toast de confirmación con botón "Ver manifest →" — toast simple implementado, falta el botón de navegación directa (mejora menor pendiente)
- [x] Verificado visualmente por el usuario: escenario Libre (confirmar) y Conflicto (reagendar con calendario), datos de prueba limpiados después
- [x] `npx tsc --noEmit` limpio · lint sin nuevos errores
- [x] PR a `main`

---

## R6 — Alta manual de reservas (drawer compartido) ✅

Rama: `feature/reservations-drawer`

- [x] `AddParticipantDrawer.tsx`: añadido `mode?: 'participant' | 'lead'`
- [x] Campos específicos de lead visibles solo en `mode='lead'` (fecha/hora preferida); grupo se deja para mejora futura, igual que en R4
- [x] Botón "Nueva Reserva" en `/reservas` abre el drawer en modo lead
- [x] `CompleteLeadModal.tsx` + `setPreferredDate` en `leads.ts`: botón "Completar" funcional para leads sin fecha
- [x] Bug encontrado durante prueba real (no contemplado en el checklist original): `reservations_assign_seat` ignoraba `preferred_time` por completo, agrupando todo a la hora por defecto. Corregido en dos migraciones:
  - `20260624000000_reservations_assign_seat_fix_time.sql` — usa `preferred_time` real del lead
  - `20260625000000_reservations_assign_seat_no_dupe_time.sql` — evita dos vuelos a la misma hora (crea uno nuevo en otra hora libre en vez de reusar un vuelo de otra hora) + reordena `order_index`/`flight_number` del día por hora de salida tras cada confirmación, para que el manifest siempre quede en orden cronológico
- [x] Datos de prueba corruptos del día 28/06 limpiados (4 participantes + 2 vuelos fantasma + el día operacional)
- [x] `npx tsc --noEmit` limpio · lint sin nuevos errores
- [ ] PR a `main`

---

## R7 — Sidebar e integración visual en el manifest

Rama: `feature/reservations-sidebar-integration`

- [x] Enlace "Reservas" en `AppSidebar` (entre "Hoy" y "Finanzas") — ya estaba hecho desde R4, sin cambios necesarios.
- [x] Badge numérico con count de leads `NEW` + `RESCHEDULE_NEEDED` — `countPendingLeads()` en `leads.ts`, fetcheado en `DashboardLayout` (Server Component) y pasado a `AppSidebar` → `NavLink` (pill numérica en desktop, dot superpuesto al icono en el rail colapsado).
- [x] Badge discreto "Bot"/"Web" en `ParticipantRow` si `channel != 'STAFF'` y `lead_status = 'CONFIRMED'` — `ChannelBadge` (WEB_BOT → "Web", WHATSAPP_BOT → "Bot"), añadido junto al nombre en ambos layouts (grid lg+ y flex mobile).
- [ ] PR a `main`

---

## R8 — Cancelación por meteorología ✅

Rama: `feature/reservations-weather-cancellation`

- [x] Cablear `handleWeatherCancellation` a `updateOperationalDay` en `DayHeader.tsx` — al marcar `weather_status = 'CANCELLED'` desde el dropdown del manifest, se llama automáticamente tras el update exitoso
- [x] Verificado contra Supabase real con datos de prueba (sembrados y limpiados después): un lead confirmado libera `flight_id` y pasa a `RESCHEDULE_NEEDED`; un walk-in sin `lead_status` se queda `WEATHER_CANCELLED` sin convertirse en lead
- [x] Badge "Reagendar" visible en `/reservas` (pestaña Pendientes) para leads `RESCHEDULE_NEEDED` — antes solo se veía el botón de acción, ahora también el badge de estado en vez del badge de disponibilidad por fecha
- [x] `npx tsc --noEmit` limpio · lint sin nuevos errores
- [ ] PR a `main`

---

## R9 — Cron de promoción de tentativas ✅

Rama: `feature/reservations-cron-promote`

- [x] `src/app/api/cron/promote-leads/route.ts` — `GET`, valida `Authorization: Bearer ${CRON_SECRET}`, usa el service client (sin sesión/cookies en una invocación de cron) y llama a `promoteTentativeLeads`
- [x] Lógica ya existía desde R3 (`promoteTentativeLeads` en `leads.ts`): busca `TENTATIVE` con `preferred_date` → `confirmLead` → `CONFIRMED` o `RESCHEDULE_NEEDED`
- [x] Refactor necesario: `getPolicy`, `getDayAvailability`, `confirmLead` y `promoteTentativeLeads` ahora aceptan un cliente Supabase opcional (`DbClient`), para que el cron pueda inyectar el service client en vez del cliente de sesión por cookies (que no existe en una llamada de cron sin usuario autenticado)
- [x] **Ajuste tras el fix de ventana rodante** (`fix/availability-rolling-window`): se eliminó el filtro de "due leads" por mes natural (`preferred_date.slice(0,7) <= currentMonth`) — ahora `promoteTentativeLeads` intenta `confirmLead` para **todos** los `TENTATIVE`, dejando que `classifyDate` (única fuente de verdad de `CONFIRMABLE_WINDOW_DAYS`) decida; un lead que sigue fuera de la ventana vuelve a clasificar `TENTATIVE_ONLY` (no-op, no se marca `RESCHEDULE_NEEDED`). `confirmLead` ahora acepta un `today` simulado como 4º parámetro para mantener testeable el cron sin depender del reloj real
- [x] `vercel.json` con cron diario a las 06:00 UTC — `CRON_SECRET` lo inyecta Vercel automáticamente en el header `Authorization` cuando la env var está configurada en el proyecto (pendiente: el hermano debe añadir `CRON_SECRET` en las env vars de Vercel)
- [x] Probado contra Supabase real con lead `TENTATIVE` y `today` simulado (datos limpiados después): a 42 días de la fecha preferida se queda `TENTATIVE` sin tocar; a 23 días (dentro de la ventana) se confirma con vuelo real vía `reservations_assign_seat`
- [x] `npx tsc --noEmit` limpio · lint sin nuevos errores
- [ ] PR a `main`

---

## Fix — Ventana de confirmación rodante (no por mes natural) ✅

Rama: `fix/availability-rolling-window`

- [x] Bug encontrado por el usuario: `classifyDate` clasificaba CONFIRMABLE vs TENTATIVE_ONLY comparando **mes natural** (`target.slice(0,7) === today.slice(0,7)`) en vez de una ventana de días. Efecto: pedir el finde siguiente estando a 28 de junio (cae en julio) daba TENTATIVE_ONLY aunque solo faltaran ~6 días; el margen de confirmación inmediata se iba achicando a medida que avanzaba el mes
- [x] `src/lib/availability/availability-engine.ts`: `classifyDate` ahora usa `CONFIRMABLE_WINDOW_DAYS = 30` (constante exportada) — CONFIRMABLE si `target` está a ≤30 días de `today`, TENTATIVE_ONLY si está más lejos, sin importar el mes natural
- [x] `__availability_check.mts` actualizado: caso de 5 días (CONFIRMABLE), 40 días (TENTATIVE_ONLY), y regresión explícita del bug reportado (28 jun → 4 jul, cruza mes, 6 días → CONFIRMABLE). Todas las aserciones PASS
- [x] `npx tsc --noEmit` limpio · lint sin nuevos errores
- [x] Alineado con R9 (`feature/reservations-cron-promote`): el filtro de "due leads" en `promoteTentativeLeads` ya no usa mes natural — ver detalle en la sección de R9
- [ ] PR a `main`

---

## R10 — API del bot ✅

Rama: `feature/reservations-bot-api`

- [x] `src/lib/api/auth.ts` (validación `X-API-Key` vía sha256 contra `api_keys` + scopes + `last_used_at`)
- [x] `src/lib/api/rate-limit.ts` (`bump_rate_limit` sobre `api_rate_limits`, migración `20260628000000_bump_rate_limit.sql`)
- [x] `GET /api/bot/v1/availability`
- [x] `GET /api/bot/v1/availability/day`
- [x] `POST /api/bot/v1/reservations` — **sin Stripe** (fuera de alcance): crea y confirma el lead en la misma llamada en vez del flujo original `AWAITING_PAYMENT`→pago→`CONFIRMED`; devuelve `CONFIRMED`/`TENTATIVE`/409 directamente
- [x] `GET /api/bot/v1/reservations/{idOrToken}` (`getLeadByIdOrToken` nuevo en `leads.ts`, busca por `id` o `token`)
- [x] Refactor necesario (mismo patrón de R9): `createParticipant`, `createLead` y `listNextAvailableSlots` ahora aceptan un cliente Supabase opcional, para que la API del bot inyecte el service client (sin sesión/cookies en una llamada de bot)
- [x] Sembrada una `api_key` de test (límite bajo a propósito) y probados los 5 casos contra producción: happy path (200/201), 401 sin key, 401 key inválida, 422 validación, 429 rate-limit, 409 con `suggestedDates` (saturando temporalmente `max_flights_per_day`); api_key de test y todos los datos sembrados limpiados después
- [x] Documentado el contrato final en `docs/reservas/BOT_API_CONTRACT.md` para Ricardo (coordinación R5 del chatbot)
- [x] `npx tsc --noEmit` limpio · lint sin nuevos errores
- [ ] PR a `main`

---

## Cierre de fase

- [ ] Actualizar tabla "Estado actual del software" en `CLAUDE.md`
- [ ] Actualizar `docs/reservas/RESERVAS_MODULE_PLAN_v1.md` si algo cambió durante la implementación
- [ ] Crear `docs/RESERVATIONS_INTEGRATION.md` (plantilla: `docs/FINANCE_V2_INTEGRATION.md`)
