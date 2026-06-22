# Apéndice técnico — Sistema de Reservas iJump (lado software)

> Compañero ejecutable de `RESERVAS_MASTER_PLAN_v2.md`. El plan maestro da la estrategia, las decisiones y las fases; este apéndice da el detalle listo para implementar (SQL, firmas, flujos). Repo: `ijump-software` (rama base `feature/finance-v2` → cortar `feature/reservations`, o desde `main` tras mergear finanzas y rebasar).

## 0. Patrones existentes a reutilizar (no reinventar)
- **Migración aditiva+reversible:** `supabase/migrations/20260618000000_finance_v2.sql` (tablas + RLS + bloque `ROLLBACK` comentado) y `20260607000000_waiver_documents.sql` (`ALTER TABLE … ADD COLUMN … DEFAULT`, `CHECK`, `UNIQUE`, índices). El waiver usa `CHECK (... IN (...))` en vez de enums de Postgres porque `ALTER TYPE … ADD VALUE` **no es reversible** (finanzas doc §6). Aplicamos lo mismo a `lead_status`.
- **Flujo público con token + service client:** `src/app/waiver/[token]/page.tsx` + `src/lib/actions/waiver.ts` (`getWaiverByToken`/`submitWaiver`) ya implementan un flujo no autenticado, direccionado por token, que salta RLS, con idempotencia por chequeo de estado. La página de éxito de Stripe y la de estado público de la reserva lo clonan 1:1.
- **Service client:** `src/lib/supabase/service.ts` `createServiceClient()` — el único cliente que salta RLS. La API del bot y el webhook de Stripe lo usan en exclusiva.
- **Forma de los Server Actions:** todo en `src/lib/actions/*.ts` devuelve `{ error?: string }` o datos, usa `await createClient()`, y termina las mutaciones con `revalidatePath('/', 'layout')`.
- **Buscar-o-crear por conteo:** `createFlight` en `src/lib/actions/flight.ts` calcula `nextIndex` por `count` e inserta con `flight_number = nextIndex+1`. La asignación de plaza lo reutiliza transaccionalmente.
- **`createParticipant(flightId, data)`** hoy exige `flightId`. Hacerlo nullable: un lead es exactamente ese insert con `flight_id = NULL`. `moveParticipant(id, newFlightId)` es la primitiva de asignación al confirmar.
- **`proxy.ts`** captura todo salvo estáticos y redirige a `/login`: **interceptará `/api/*` y devolverá un 307 HTML al bot**. Hay que arreglarlo (§8).
- **Footgun de entorno:** `.env.local` tiene `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` (mal) pero `service.ts` lee `SUPABASE_SERVICE_ROLE_KEY`. Renombrar **antes** de activar API/webhook.

---

## 1. Migración — `supabase/migrations/20260620000000_reservations.sql`

Decisiones clave: (D1) lead = participante con `flight_id NULL` + ciclo de vida (sin tabla de leads, sin migración al confirmar). (D2) `lead_status` como `TEXT+CHECK`, no enum (reversibilidad); ortogonal a `operational_status`. (D3) reutilizar `payments` para el depósito (`stage='RESERVA'`) + tabla fina `payment_sessions` para el ciclo de Stripe (así "payments = lo cobrado" se mantiene). (D4) reutilizar `reservation_groups` para grupos (no `lead_groups`). (D5) `business_settings` para `max_flights_per_day` (parámetro de negocio). (D6) `api_keys` guarda solo el hash.

```sql
-- ADITIVA + REVERSIBLE. Patrón: 20260607000000_waiver_documents.sql + RLS/ROLLBACK de finance_v2.
-- Lead/reserva = participante con flight_id IS NULL + lead_status. lead_status = TEXT+CHECK (NO enum) por reversibilidad.

-- 1. participants — ciclo de vida del lead (todo nullable/DEFAULT → filas existentes intactas)
ALTER TABLE participants
  ADD COLUMN lead_status      TEXT,
  ADD COLUMN preferred_date   DATE,
  ADD COLUMN preferred_time   TIME,
  ADD COLUMN confirmed_date   DATE,
  ADD COLUMN deposit_paid     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN deposit_amount   NUMERIC(10,2),
  ADD COLUMN channel          TEXT NOT NULL DEFAULT 'STAFF',
  ADD COLUMN created_by       TEXT,
  ADD COLUMN lead_expires_at  TIMESTAMPTZ,
  ADD COLUMN token            UUID DEFAULT gen_random_uuid();

ALTER TABLE participants
  ADD CONSTRAINT participants_lead_status_check
    CHECK (lead_status IS NULL OR lead_status IN
      ('NEW','AWAITING_PAYMENT','TENTATIVE','CONFIRMED','CANCELLED','EXPIRED','RESCHEDULE_NEEDED')),
  ADD CONSTRAINT participants_channel_check
    CHECK (channel IN ('WEB_BOT','WHATSAPP_BOT','STAFF')),
  ADD CONSTRAINT participants_token_unique UNIQUE (token);

CREATE INDEX idx_participants_lead_status    ON participants(lead_status)    WHERE lead_status IS NOT NULL;
CREATE INDEX idx_participants_preferred_date ON participants(preferred_date) WHERE preferred_date IS NOT NULL;
CREATE INDEX idx_participants_confirmed_date ON participants(confirmed_date) WHERE confirmed_date IS NOT NULL;

-- 2. reservation_groups — reutilizada para agrupar leads
ALTER TABLE reservation_groups
  ADD COLUMN contact_phone TEXT,
  ADD COLUMN contact_email TEXT,
  ADD COLUMN channel       TEXT NOT NULL DEFAULT 'STAFF',
  ADD COLUMN created_by    TEXT;

-- 3. payment_sessions — ciclo de Stripe Checkout (fuera de payments)
CREATE TABLE payment_sessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id           UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  reservation_group_id     UUID REFERENCES reservation_groups(id) ON DELETE SET NULL,
  provider                 TEXT NOT NULL DEFAULT 'STRIPE',
  stripe_session_id        TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  amount                   NUMERIC(10,2) NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'eur',
  status                   TEXT NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING','PAID','EXPIRED','FAILED','REFUNDED')),
  checkout_url             TEXT,
  payment_id               UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_sessions_participant ON payment_sessions(participant_id);
CREATE INDEX idx_payment_sessions_session     ON payment_sessions(stripe_session_id);
CREATE TRIGGER set_payment_sessions_updated_at
  BEFORE UPDATE ON payment_sessions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 4. stripe_events — idempotencia del webhook
CREATE TABLE stripe_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. api_keys — auth del bot (solo el hash)
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  key_prefix    TEXT NOT NULL,
  scopes        TEXT[] NOT NULL DEFAULT ARRAY['reservations:write','availability:read','status:read'],
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE active = TRUE;

-- 6. api_rate_limits — contador ventana-fija en BD (sin Redis)
CREATE TABLE api_rate_limits (
  api_key_id   UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_start)
);

-- 7. business_settings — parámetros configurables
CREATE TABLE business_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO business_settings (key, value, description) VALUES
  ('max_flights_per_day', '10', 'Max vuelos por jornada (capacidad) — CONFIRMAR con Raúl'),
  ('max_clients_per_flight', '2', 'Capacidad tándem por vuelo'),
  ('deposit_amount_eur', '60', 'Depósito de reserva online'),
  ('operating_weekdays', '6,0', '6=Sáb,0=Dom (Date.getUTCDay)'),
  ('default_first_flight_time', '09:00', 'Hora del primer vuelo de una jornada nueva'),
  ('lead_hold_minutes', '30', 'Vida de un hold AWAITING_PAYMENT antes de expirar');

-- 8. RLS — misma postura. Bot/webhook usan service client (salta RLS).
ALTER TABLE payment_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON payment_sessions  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated full access" ON business_settings FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated can read api_keys" ON api_keys FOR SELECT TO authenticated USING (TRUE);
-- api_keys (write) / stripe_events / api_rate_limits: SIN política authenticated → RLS deniega; solo service client.

-- ============================================================
-- ROLLBACK (manual). Lo viejo nunca se tocó destructivamente.
-- DROP TABLE IF EXISTS api_rate_limits, api_keys, stripe_events, payment_sessions, business_settings;
-- ALTER TABLE reservation_groups DROP COLUMN IF EXISTS contact_phone, DROP COLUMN IF EXISTS contact_email,
--   DROP COLUMN IF EXISTS channel, DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_lead_status_check,
--   DROP CONSTRAINT IF EXISTS participants_channel_check, DROP CONSTRAINT IF EXISTS participants_token_unique,
--   DROP COLUMN IF EXISTS lead_status, DROP COLUMN IF EXISTS preferred_date, DROP COLUMN IF EXISTS preferred_time,
--   DROP COLUMN IF EXISTS confirmed_date, DROP COLUMN IF EXISTS deposit_paid, DROP COLUMN IF EXISTS deposit_amount,
--   DROP COLUMN IF EXISTS channel, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS lead_expires_at,
--   DROP COLUMN IF EXISTS token;
-- ============================================================
```

**Tipos:** hand-extend `database.types.ts` (5 tablas + columnas nuevas) y `domain.ts` (`LeadStatus`, `Channel`, `PaymentSessionStatus`, `PaymentSession`, `ApiKey`, `BusinessSetting`, extender `Participant`, `LeadWithDetails`). Paso humano: regenerar `database.types.ts` tras aplicar.

---

## 2. Motor de disponibilidad — puro + testeable

Núcleo puro `src/lib/availability/availability-engine.ts` (sin I/O, como `pnl-engine.ts`) + wrappers `src/lib/actions/availability.ts`.

```ts
export interface AvailabilityPolicy { maxClientsPerFlight: number; maxFlightsPerDay: number; operatingWeekdays: number[] }
export interface DayLoad { date: string; weatherStatus: 'OK'|'MARGINAL'|'CANCELLED'
  flights: { id: string; activeParticipantCount: number }[] }   // activos = excluye CANCELLED/NO_SHOW/WEATHER_CANCELLED
export interface DaySlots { date: string; isWeekend: boolean; weatherCancelled: boolean
  existingFlights: number; freeSeatsInExistingFlights: number; potentialNewFlights: number
  totalFreeSeats: number; bookable: boolean }

export function isOperatingDay(date: string, p: AvailabilityPolicy): boolean
export function computeDaySlots(load: DayLoad, p: AvailabilityPolicy): DaySlots
export type DateClass = 'CONFIRMABLE'|'TENTATIVE_ONLY'|'UNAVAILABLE'|'NOT_OPERATING'
export function classifyDate(target: string, today: string, slots: DaySlots, p: AvailabilityPolicy): DateClass
```

`classifyDate`: `!isOperatingDay`→NOT_OPERATING; `weatherCancelled || totalFreeSeats===0`→UNAVAILABLE; mismo `YYYY-MM` que hoy y `target>=today`→CONFIRMABLE; mes futuro→TENTATIVE_ONLY; pasado→UNAVAILABLE.

Wrappers: `getPolicy()` (de `business_settings`), `getDayAvailability(date)`, `getMonthAvailability(YYYY-MM)`, `listNextAvailableSlots({fromDate,limit,monthScope})` (camina fines de semana hacia delante — lo que el bot llama para sugerir fechas). `getDayAvailability` trata un día sin `operational_day` como 0 vuelos / OK / reservable hasta `maxFlightsPerDay*cap`.

---

## 3. Ciclo de vida — `src/lib/actions/leads.ts`
`createLead(input)` (participante con `flight_id NULL`, `lead_status='NEW'`, `deposit_amount` de settings, `lead_expires_at`), `confirmLead(leadId,date)`, `rescheduleLead`, `cancelLead`, `listLeads(filter)`, `handleWeatherCancellation(dayId)`, `promoteTentativeLeads(today?)`.

**`confirmLead` (corazón transaccional):** 1) re-chequear disponibilidad de `date`; 2) `classifyDate` debe ser CONFIRMABLE (si TENTATIVE_ONLY → `lead_status='TENTATIVE'`, `preferred_date=date`, return); 3) buscar-o-crear `operational_day(date)`; 4) `findOrCreateFlightWithSeat(dayId,cap)` (primer vuelo con `<cap` activos, si no crear vuelo siguiente hasta `maxFlightsPerDay`); 5) `moveParticipant`, `lead_status='CONFIRMED'`, `confirmed_date`, `operational_status='PENDING'`.
**Concurrencia:** envolver 3–5 en una función Postgres `reservations_assign_seat(lead_id, date)` con `SELECT … FOR UPDATE` sobre los vuelos del día, llamada por `supabase.rpc()`. El re-chequeo en JS no basta contra confirmaciones simultáneas.

Modificar `participant.ts`: `createParticipant(flightId: string|null, data)`; añadir campos de lead; helper `freeSeat(id)` (set `flight_id=null`) para reschedule/cancel/meteo. `AddParticipantDrawer` con `mode?:'participant'|'lead'`.

---

## 4. Pago — Stripe Checkout
Dep nueva `stripe`. `src/lib/stripe/client.ts`. `createDepositCheckout(leadId)`: crea `payment_sessions` (PENDING) → `stripe.checkout.sessions.create({ mode:'payment', payment_method_types:['card','bizum'], line_items:[…unit_amount: amount*100…], metadata:{lead_id,payment_session_id}, success_url/cancel_url:'/reserva/{token}', expires_at })` → guarda `stripe_session_id`+`checkout_url` → `lead_status='AWAITING_PAYMENT'` → return `checkout_url`.

**Webhook `src/app/api/webhooks/stripe/route.ts`** (`export const dynamic='force-dynamic'`, runtime nodejs): leer **raw body** (`await req.text()`), `stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)` (400 si falla). Idempotencia: `INSERT stripe_events(id,type)` → 23505 ⇒ ya procesado, 200. En `checkout.session.completed`: si `payment_sessions` ya PAID → 200; insertar `payments` (`stage='RESERVA'`, `method` bizum?'BIZUM':'TARJETA') **solo si `payment_id IS NULL`**; `payment_sessions='PAID'`+`payment_id`+`stripe_payment_intent_id`; `deposit_paid=true`; **auto-confirmar** vía RPC `reservations_assign_seat(preferred_date)` (CONFIRMABLE→CONFIRMED; futuro→TENTATIVE; lleno→RESCHEDULE_NEEDED). `checkout.session.expired`→`EXPIRED`. Todo con **service client**.

Página pública `src/app/reserva/[token]/page.tsx` (clon del waiver) muestra el resultado.
Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.

---

## 5. Contrato de API del bot
`src/app/api/bot/v1/...`, runtime nodejs, service client. Auth `X-API-Key: ijk_live_<rnd>` → `sha256` contra `api_keys`. Middleware `src/lib/api/auth.ts` (valida + scopes + `last_used_at`). Rate-limit `src/lib/api/rate-limit.ts` (función `bump_rate_limit(key_id,limit)` upsert atómico en `api_rate_limits`; 429 + `Retry-After`). Validación Zod. Error `{ error:{ code, message } }`.

```jsonc
// POST /api/bot/v1/reservations  (scope reservations:write)
// req: { fullName, phone, email, packageType, weight, preferredDate, source, participants?:[{fullName,weight}] }
// 201: { reservationId, token, status:"AWAITING_PAYMENT", depositAmount:60,
//        paymentUrl:"https://checkout.stripe.com/...", dateClassification:"CONFIRMABLE", statusUrl:"/reserva/<token>" }
// 409 (UNAVAILABLE): { error:{code:"unavailable"}, suggestedDates:[...] }

// GET /api/bot/v1/availability?from=YYYY-MM-DD&limit=6  (scope availability:read)
// { slots:[ {date, freeSeats, classification:"CONFIRMABLE"|"TENTATIVE_ONLY"} ] }
// GET /api/bot/v1/availability/day?date=YYYY-MM-DD  → DaySlots

// POST /api/bot/v1/reservations/{id}/payment-link  → { paymentUrl, expiresAt }  (idempotente: reusa PENDING vivo)
// GET  /api/bot/v1/reservations/{idOrToken}  (scope status:read)
//   → { id, status, depositPaid, confirmedDate, preferredDate, packageType, fullName }
```
**`proxy.ts`:** early-return en `pathname.startsWith('/api/')` y `/reserva/` pública.

---

## 6. UI `/reservas`
`src/app/(dashboard)/reservas/page.tsx` (server, `listLeads` por tab) + `ReservationsView` (tabs Pendientes/Confirmadas/Canceladas), `ReservationStatusBadge`, `ConfirmReservationModal`/`RescheduleReservationModal` con `WeekendAvailabilityCalendar` (verde=CONFIRMABLE, ámbar=TENTATIVE_ONLY, gris=lleno/cerrado, de `getMonthAvailability`), reutilizar `AddParticipantDrawer` en `mode='lead'`, entrada "Reservas" en `AppSidebar` (entre "Hoy" y "Finanzas").

---

## 7. Fases (lado software) + verificación
**R1** datos+disponibilidad (migración, tipos, motor+tests, createLead/confirmLead/cancelLead/listLeads, /reservas con confirmación manual). **R2** API bot (api_keys+middleware+rate-limit+Zod; GET /availability, POST /reservations sin pago, GET /reservations/{id}). **R3** Stripe (checkout, webhook+idempotencia, /reserva/[token], AWAITING_PAYMENT→CONFIRMED). **R4** tentativa/cron `promoteTentativeLeads` (`src/app/api/cron/promote-leads/route.ts` con cron secret) + `handleWeatherCancellation` (cableado a `updateOperationalDay`) + reagendar. **R5** hardening.

**Verificación:** check puro `src/lib/availability/__availability_check.mts` (vía jiti, como `__pnl_check.mts`): fin de semana, tope 2/vuelo, límite max_flights_per_day, meteo=0, classifyDate mes actual vs futuro, día lleno→UNAVAILABLE. Migración en rama Supabase (no prod) + regenerar tipos. Stripe test mode (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`, tarjeta 4242, Bizum): una fila `payments` stage RESERVA, sesión PAID, deposit_paid, lead CONFIRMED, replay sin duplicado. API con clave de test (401/422/429/409). E2E: POST mes futuro→TENTATIVE_ONLY+paymentUrl→pagar→TENTATIVE→`promoteTentativeLeads` con today simulado→CONFIRMED; meteo-cancelar día→RESCHEDULE_NEEDED + plazas liberadas.

---

## 8. Seguridad & RLS
1. **Arreglar `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` ANTES de R2/R3** (renombrar en `.env.local`+Vercel). Service client activo + service key filtrada = compromiso total.
2. `proxy.ts`: saltar `/api/`, permitir `/reserva/`.
3. API keys hasheadas (sha256), nunca loguear completas (solo `key_prefix`), scopes por ruta, rotación/revocación (`active`/`revoked_at`).
4. Webhook: verificación de firma obligatoria + ledger `stripe_events` anti-replay.
5. `api_keys`/`stripe_events`/`api_rate_limits` = secretos, no datos de app (sin política authenticated de escritura).
6. Zod en toda entrada del bot + flujo público de pago (longitudes, fechas, peso).
7. Rate-limit por clave + fallback por IP en creación.
8. Diferido (flag, no bloquea): RLS por rol al añadir un 2º usuario (el path del bot usa service client, no se ve afectado).

---

### Archivos a crear/modificar (resumen)
- `supabase/migrations/20260620000000_reservations.sql` (nuevo)
- `src/lib/availability/availability-engine.ts` + `src/lib/actions/availability.ts` (nuevos) + `src/lib/availability/__availability_check.mts` (test)
- `src/lib/actions/leads.ts` (nuevo) · `src/lib/actions/participant.ts` (modificar: flightId nullable, freeSeat)
- `src/lib/stripe/client.ts` + `src/app/api/webhooks/stripe/route.ts` (nuevos)
- `src/lib/api/auth.ts` + `src/lib/api/rate-limit.ts` + `src/app/api/bot/v1/**/route.ts` (nuevos)
- `src/app/reserva/[token]/page.tsx` (nuevo) · `src/proxy.ts` (modificar: saltar /api, permitir /reserva)
- `src/app/(dashboard)/reservas/**` + `src/components/operational/{ReservationsView,ReservationStatusBadge,ConfirmReservationModal,RescheduleReservationModal,WeekendAvailabilityCalendar}.tsx` (nuevos) · `src/components/layout/AppSidebar.tsx` (modificar)
- `src/types/domain.ts` + `src/lib/supabase/database.types.ts` (extender) · `package.json` (añadir `stripe`)
- `src/app/api/cron/promote-leads/route.ts` (nuevo, R4)
