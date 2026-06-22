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
  - [x] `classifyDate` mes actual vs mes futuro
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

## R3 — Ciclo de vida del lead

Rama: `feature/reservations-lifecycle`

- [ ] `src/lib/actions/participant.ts`:
  - [ ] Relajar `createParticipant(flightId: string | null, data)`
  - [ ] Helper `freeSeat(id)` (set `flight_id = NULL`)
- [ ] Función Postgres `reservations_assign_seat(lead_id, date)` con `SELECT ... FOR UPDATE` sobre vuelos del día (migración separada o añadida a la de R1 si aún no se ha mergeado)
- [ ] `src/lib/actions/leads.ts`:
  - [ ] `createLead(input)`
  - [ ] `confirmLead(leadId, date)` → llama a la RPC, gestiona CONFIRMABLE vs TENTATIVE_ONLY
  - [ ] `rescheduleLead(leadId, newDate)`
  - [ ] `cancelLead(leadId)`
  - [ ] `listLeads(filter)`
  - [ ] `handleWeatherCancellation(dayId)`
  - [ ] `promoteTentativeLeads(today?)`
- [ ] Probar concurrencia: dos confirmaciones simultáneas al mismo slot → solo una gana
- [ ] PR a `main`

---

## R4 — UI: página `/reservas`

Rama: `feature/reservations-ui-list`

- [ ] `src/app/reservas/page.tsx`
- [ ] `src/app/reservas/components/ReservationsView.tsx` (tabs Pendientes / Confirmadas / Canceladas)
- [ ] `src/app/reservas/components/ReservationRow.tsx`
- [ ] `src/app/reservas/components/ReservationStatusBadge.tsx` (Libre / Tentativa / Conflicto / Reagendar / Sin fecha)
- [ ] Soporte visual de grupos (↓↑ + expandir miembros)
- [ ] Seguir `docs/DESIGN_SYSTEM.md` (tokens OKLCH, sin colores hardcodeados)
- [ ] Probar en viewport ~820px (tablet)
- [ ] PR a `main`

---

## R5 — UI: acciones de confirmación/reagenda

Rama: `feature/reservations-ui-actions`

- [ ] `ConfirmReservationModal.tsx` (Casos A y B del plan)
- [ ] `RescheduleReservationModal.tsx` (Caso C)
- [ ] `WeekendAvailabilityCalendar.tsx` (verde CONFIRMABLE / ámbar TENTATIVE_ONLY / gris UNAVAILABLE-NOT_OPERATING)
- [ ] Toast de confirmación con botón "Ver manifest →"
- [ ] PR a `main`

---

## R6 — Alta manual de reservas (drawer compartido)

Rama: `feature/reservations-drawer`

- [ ] `AddParticipantDrawer.tsx`: añadir `mode?: 'participant' | 'lead'`
- [ ] Campos específicos de lead visibles solo en `mode='lead'` (fecha/hora preferida, grupo)
- [ ] Botón "Nueva Reserva" en `/reservas` abre el drawer en modo lead
- [ ] PR a `main`

---

## R7 — Sidebar e integración visual en el manifest

Rama: `feature/reservations-sidebar-integration`

- [ ] Enlace "Reservas" en `AppSidebar` (entre "Hoy" y "Finanzas")
- [ ] Badge numérico con count de leads `NEW` + `RESCHEDULE_NEEDED`
- [ ] Badge discreto "Bot"/"Web" en `ParticipantRow` si `channel != 'STAFF'` y `lead_status = 'CONFIRMED'`
- [ ] PR a `main`

---

## R8 — Cancelación por meteorología

Rama: `feature/reservations-weather-cancellation`

- [ ] Cablear `handleWeatherCancellation` a `updateOperationalDay` (al marcar `weather_status = 'CANCELLED'`)
- [ ] Verificar que libera `flight_id` y marca `RESCHEDULE_NEEDED` en todos los participantes confirmados de esa jornada
- [ ] Badge "Reagendar" visible en `/reservas` para esos leads
- [ ] PR a `main`

---

## R9 — Cron de promoción de tentativas

Rama: `feature/reservations-cron-promote`

- [ ] `src/app/api/cron/promote-leads/route.ts`
- [ ] Lógica: buscar `TENTATIVE` con `preferred_date` en mes actual → intentar `confirmLead` → `CONFIRMED` o `RESCHEDULE_NEEDED`
- [ ] Configurar cron en Vercel (`vercel.json` o panel) con secret de autenticación
- [ ] Probar con `today` simulado (mes que aún no ha llegado → llega → promueve)
- [ ] PR a `main`

---

## R10 — API del bot

Rama: `feature/reservations-bot-api`

- [ ] `src/lib/api/auth.ts` (validación `X-API-Key` vía sha256 contra `api_keys`)
- [ ] `src/lib/api/rate-limit.ts` (`bump_rate_limit` sobre `api_rate_limits`)
- [ ] `GET /api/bot/v1/availability`
- [ ] `GET /api/bot/v1/availability/day`
- [ ] `POST /api/bot/v1/reservations`
- [ ] `GET /api/bot/v1/reservations/{idOrToken}`
- [ ] Sembrar una `api_key` de test y probar cada endpoint (`curl`): happy path, 401, 422, 429, 409 con `suggestedDates`
- [ ] Documentar el contrato final para Ricardo (coordinación R5 del chatbot)
- [ ] PR a `main`

---

## Cierre de fase

- [ ] Actualizar tabla "Estado actual del software" en `CLAUDE.md`
- [ ] Actualizar `docs/reservas/RESERVAS_MODULE_PLAN_v1.md` si algo cambió durante la implementación
- [ ] Crear `docs/RESERVATIONS_INTEGRATION.md` (plantilla: `docs/FINANCE_V2_INTEGRATION.md`)
