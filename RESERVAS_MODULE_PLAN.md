# Plan de Implementación: Módulo de Gestión de Reservas (Leads → Manifest)

> **Versión**: 2.0 — 21 Jun 2026  
> **Estado**: Pendiente de implementación  
> **Pago online (Stripe)**: excluido de este plan — se implementará en una fase posterior separada.

---

## 1. Concepto Clave: Una Sola Entidad

La decisión de diseño más importante de este módulo es que **el cliente es siempre la misma entidad**, independientemente de si está en la lista de reservas o en el manifest del día.

Cuando el staff (o el bot) crea un cliente en la sección de Reservas, se crea una fila en la tabla `participants` con su `id` definitivo. Esa misma fila, con ese mismo `id`, es la que aparece en el manifest cuando se confirma la fecha. No hay migración de datos entre tablas, no hay duplicados. Lo único que cambia al confirmar es que se le asigna un `flight_id` y una fecha real.

```
RESERVA CREADA              RESERVA CONFIRMADA
──────────────              ──────────────────
participant.id = X          participant.id = X        ← mismo registro
participant.flight_id = NULL                          participant.flight_id = vuelo_del_dia
participant.lead_status = 'NEW'                       participant.lead_status = 'CONFIRMED'
participant.preferred_date = '2026-06-22'             participant.confirmed_date = '2026-06-22'
```

---

## 2. Cambios en la Base de Datos

### 2.1 Nuevos campos en `participants` (tabla existente)

Todos los campos son opcionales/con DEFAULT para que las filas ya existentes queden intactas.

```sql
ALTER TABLE participants
  ADD COLUMN lead_status     TEXT,
  ADD COLUMN preferred_date  DATE,
  ADD COLUMN preferred_time  TIME,
  ADD COLUMN confirmed_date  DATE,
  ADD COLUMN confirmed_time  TIME,
  ADD COLUMN deposit_paid    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN channel         TEXT NOT NULL DEFAULT 'STAFF',
  ADD COLUMN created_by      TEXT,
  ADD COLUMN token           UUID DEFAULT gen_random_uuid();

-- TEXT + CHECK en vez de enum de Postgres (los enums no son reversibles)
ALTER TABLE participants
  ADD CONSTRAINT participants_lead_status_check
    CHECK (lead_status IS NULL OR lead_status IN
      ('NEW', 'TENTATIVE', 'CONFIRMED', 'RESCHEDULE_NEEDED', 'CANCELLED', 'NO_SHOW')),
  ADD CONSTRAINT participants_channel_check
    CHECK (channel IN ('WEB_BOT', 'WHATSAPP_BOT', 'STAFF')),
  ADD CONSTRAINT participants_token_unique UNIQUE (token);

CREATE INDEX idx_participants_lead_status    ON participants(lead_status)    WHERE lead_status IS NOT NULL;
CREATE INDEX idx_participants_preferred_date ON participants(preferred_date) WHERE preferred_date IS NOT NULL;
CREATE INDEX idx_participants_confirmed_date ON participants(confirmed_date) WHERE confirmed_date IS NOT NULL;
```

**Regla de negocio**: Un participante ES un lead si `lead_status IS NOT NULL`. Un participante creado directamente en el manifest tiene `lead_status = NULL` y `flight_id` asignado desde el principio.

#### Ciclo de vida de `lead_status`

| Estado | Significado |
|--------|-------------|
| `NEW` | Lead recién creado (manual o por bot). Pendiente de gestión. |
| `TENTATIVE` | La fecha preferida es de un **mes futuro**. No ocupa plaza real todavía. Se auto-promueve a `CONFIRMED` cuando llega ese mes. |
| `CONFIRMED` | Asignado a un vuelo real en el manifest. `flight_id` ya no es NULL. |
| `RESCHEDULE_NEEDED` | La jornada fue cancelada (meteorología u otro motivo). Plaza liberada, pendiente de nueva fecha. |
| `CANCELLED` | Cancelado definitivamente. |
| `NO_SHOW` | No se presentó el día del salto. 

**`lead_status` vs `operational_status`**: son ortogonales. `lead_status` es el estado comercial/previo al salto. `operational_status` es el estado operativo del día (PENDING → CHECKED_IN → ... → COMPLETED). Un participante CONFIRMED entra en el flujo `operational_status` normal a partir de ese momento.

#### Por qué `deposit_paid` sin Stripe

`deposit_paid` (boolean) es útil aunque no haya pago online: el staff puede marcarlo manualmente cuando Raúl confirme que recibió una transferencia. No require ninguna infraestructura adicional.

### 2.2 Campos nuevos en `reservation_groups` (tabla existente)

Se reutiliza la tabla existente para agrupar leads en vez de crear una tabla nueva `lead_groups`. Más limpio, evita duplicar una entidad casi idéntica.

```sql
ALTER TABLE reservation_groups
  ADD COLUMN contact_phone TEXT,
  ADD COLUMN contact_email TEXT,
  ADD COLUMN channel       TEXT NOT NULL DEFAULT 'STAFF',
  ADD COLUMN created_by    TEXT;
```

### 2.3 Nueva tabla: `api_keys`

Para autenticar las llamadas del bot web y WhatsApp.

```sql
CREATE TABLE api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label               TEXT NOT NULL,
  key_hash            TEXT NOT NULL UNIQUE,   -- SHA-256 del key real, nunca plaintext
  key_prefix          TEXT NOT NULL,           -- primeros 8 chars para identificar en logs
  scopes              TEXT[] NOT NULL DEFAULT ARRAY['reservations:write','availability:read','status:read'],
  rate_limit_per_min  INTEGER NOT NULL DEFAULT 60,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at          TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE active = TRUE;
```

### 2.4 Nueva tabla: `api_rate_limits`

Rate limiting por clave sin depender de Redis.

```sql
CREATE TABLE api_rate_limits (
  api_key_id   UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_start)
);
```

### 2.5 Nueva tabla: `business_settings`

Parámetros de negocio configurables sin tocar código. Evita hardcodear la capacidad del centro.

```sql
CREATE TABLE business_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO business_settings (key, value, description) VALUES
  ('max_flights_per_day',      '10',   'Máx. vuelos por jornada — confirmar con Raúl'),
  ('max_clients_per_flight',   '2',    'Capacidad tándem por vuelo'),
  ('operating_weekdays',       '6,0',  '6=Sáb, 0=Dom (JS Date.getUTCDay). CONFIRMAR si opera entre semana'),
  ('default_first_flight_time','09:00','Hora del primer vuelo de una jornada nueva');
```

> ⚠️ **`operating_weekdays` requiere confirmación con Raúl.** Si el centro opera algún día entre semana, hay que ajustar este valor. El motor de disponibilidad marcará los días no incluidos como `NOT_OPERATING` y el bot nunca sugerirá esas fechas.

### 2.6 RLS

```sql
ALTER TABLE api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON business_settings FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated can read api_keys" ON api_keys FOR SELECT TO authenticated USING (TRUE);
-- api_keys (write) y api_rate_limits: SIN política authenticated → solo service client los toca.
```

### 2.7 ROLLBACK (bloque manual comentado en la migración)

```sql
-- DROP TABLE IF EXISTS api_rate_limits, api_keys, business_settings;
-- ALTER TABLE reservation_groups DROP COLUMN IF EXISTS contact_phone, contact_email, channel, created_by;
-- ALTER TABLE participants
--   DROP CONSTRAINT IF EXISTS participants_lead_status_check,
--   DROP CONSTRAINT IF EXISTS participants_channel_check,
--   DROP CONSTRAINT IF EXISTS participants_token_unique,
--   DROP COLUMN IF EXISTS lead_status, preferred_date, preferred_time, confirmed_date,
--                         confirmed_time, deposit_paid, channel, created_by, token;
```

---

## 3. Motor de Disponibilidad

Se implementa como dos capas separadas, siguiendo el mismo patrón que `pnl-engine.ts` del módulo de finanzas.

### 3.1 `src/lib/availability/availability-engine.ts` — lógica pura, sin I/O

Sin acceso a base de datos. Recibe datos ya cargados y devuelve resultados. Completamente testeable sin BD.

```typescript
export interface AvailabilityPolicy {
  maxClientsPerFlight: number
  maxFlightsPerDay: number
  operatingWeekdays: number[]   // [6, 0] = sábado y domingo
}

export interface DayLoad {
  date: string
  weatherStatus: 'OK' | 'MARGINAL' | 'CANCELLED'
  flights: { id: string; activeParticipantCount: number }[]
  // activeParticipantCount excluye CANCELLED / NO_SHOW / WEATHER_CANCELLED
}

export interface DaySlots {
  date: string
  isOperatingDay: boolean
  weatherCancelled: boolean
  existingFlights: number
  freeSeatsInExistingFlights: number
  potentialNewFlights: number         // cuántos vuelos más se pueden crear
  totalFreeSeats: number
  bookable: boolean
}

// CONFIRMABLE   = mes actual, tiene plazas libres → se asigna flight_id real
// TENTATIVE_ONLY = mes futuro → lead queda TENTATIVE sin plaza hasta que llegue el mes
// UNAVAILABLE   = lleno o meteo cancelado
// NOT_OPERATING = día de la semana no operativo

export type DateClass = 'CONFIRMABLE' | 'TENTATIVE_ONLY' | 'UNAVAILABLE' | 'NOT_OPERATING'

export function isOperatingDay(date: string, policy: AvailabilityPolicy): boolean
export function computeDaySlots(load: DayLoad, policy: AvailabilityPolicy): DaySlots
export function classifyDate(target: string, today: string, slots: DaySlots): DateClass
```

### 3.2 `src/lib/actions/availability.ts` — wrappers con acceso a BD

```typescript
getPolicy()                              // lee business_settings de BD
getDayAvailability(date)                 // carga DayLoad de BD + llama al motor
getMonthAvailability(yearMonth)          // idem para un mes completo
listNextAvailableSlots({ fromDate, limit }) // camina días hacia adelante buscando slots libres
```

`getDayAvailability` trata un día sin `operational_day` como 0 vuelos / weather OK / totalmente reservable.

### 3.3 Regla CONFIRMABLE vs TENTATIVE_ONLY

- Si la fecha solicitada es del **mes actual**: el lead se confirma con `flight_id` real (`CONFIRMED`).
- Si la fecha es de un **mes futuro**: el lead queda en `TENTATIVE`. No ocupa plaza. Cuando llegue ese mes, un cron diario (`promoteTentativeLeads`) lo intenta confirmar automáticamente.

Esto resuelve el caso de "alguien reserva para dentro de 2 meses": queda registrado, con su fecha de preferencia, sin bloquear capacidad real.

---

## 4. Flujo Completo del Proceso

### 4.1 Creación de un lead (manual por staff)

```
Staff abre /reservas → click "Nueva Reserva"
    ↓
Drawer con campos:
  · Nombre completo *
  · Teléfono / Email / Peso
  · Paquete (SOLO / HANDYCAM / VIDEO / etc.)
  · Fuente (DIRECT / GROUPON / BONO / PROMO / SMARTBOX)
  · Fecha preferida * / Hora preferida (opcional)
  · ¿Viene en grupo? → toggle → seleccionar grupo existente o crear uno nuevo
  · Notas
    ↓
Al guardar:
  · Se crea participant con flight_id = NULL, lead_status = 'NEW', channel = 'STAFF'
  · Si tiene grupo, se asigna reservation_group_id
  · Sistema comprueba disponibilidad y muestra indicador inmediatamente
    ↓
La fila aparece en /reservas con el badge de disponibilidad
```

### 4.2 Creación de un lead (automática por bot)

```
Bot (web o WhatsApp) recibe datos del cliente
    ↓
POST /api/bot/v1/reservations  con datos del cliente + preferred_date/time
    ↓
Endpoint valida API key (header X-API-Key)
    ↓
Se crea participant con lead_status = 'NEW', channel = 'WEB_BOT' o 'WHATSAPP_BOT'
    ↓
Response incluye clasificación de disponibilidad de la fecha
    ↓
El lead aparece en /reservas igual que si lo hubiera creado el staff
```

### 4.3 Confirmación al manifest — Caso A: fecha disponible (mes actual)

```
Staff ve la fila con indicador verde "Disponible – 22 Jun"
    ↓
Click "Confirmar"
    ↓
Modal muestra:
  · Fecha confirmada (= preferred_date si hay plaza)
  · Vuelo sugerido (el primero con < 2 participantes a la hora más próxima)
  · Resumen del cliente
    ↓
Staff confirma (puede ajustar fecha/hora si quiere)
    ↓
Sistema ejecuta en una RPC Postgres (para evitar sobreventa con confirmaciones simultáneas):
  1. Re-chequea disponibilidad con SELECT ... FOR UPDATE sobre vuelos del día
  2. Crea operational_day si no existe
  3. Busca vuelo con hueco o crea uno nuevo (hasta max_flights_per_day)
  4. Asigna participant.flight_id = ese vuelo
  5. lead_status = 'CONFIRMED', confirmed_date, confirmed_time
    ↓
Toast: "Juan López confirmado al manifest del 22 Jun – Vuelo 3"
Botón en el toast: "Ver manifest →"
```

> **Por qué RPC Postgres**: si dos miembros del staff confirman a la vez el mismo slot, un re-chequeo en JavaScript no basta — pueden leer el mismo estado libre y ambos escribir. El `FOR UPDATE` en la BD garantiza que solo uno gana el slot.

### 4.4 Confirmación al manifest — Caso B: fecha de mes futuro

```
Staff ve la fila de un lead con preferred_date en un mes futuro
    ↓
Click "Confirmar"
    ↓
El sistema detecta que la fecha es TENTATIVE_ONLY (mes futuro)
    ↓
Lead pasa a lead_status = 'TENTATIVE' con preferred_date guardada
(NO se asigna flight_id — no ocupa plaza todavía)
    ↓
Cuando llegue ese mes: el cron promoteTentativeLeads lo intenta confirmar automáticamente
Si hay plaza → CONFIRMED con flight_id real
Si no hay plaza → RESCHEDULE_NEEDED, el staff lo ve en la lista y lo gestiona
```

### 4.5 Confirmación al manifest — Caso C: conflicto (fecha llena)

```
Staff ve la fila con indicador rojo "Conflicto – 22 Jun completo"
    ↓
Click "Reagendar"
    ↓
Modal con mini-calendario:
  · Verde = CONFIRMABLE (tiene plazas en mes actual)
  · Ámbar = TENTATIVE_ONLY (mes futuro, quedará tentativa)
  · Gris = UNAVAILABLE o NOT_OPERATING
    ↓
Staff elige fecha alternativa → mismo flujo que Caso A o B
Se registra que confirmed_date ≠ preferred_date
```

### 4.6 Cancelación de jornada por meteorología

```
Staff cambia weather_status de una jornada a 'CANCELLED'
    ↓
handleWeatherCancellation(dayId) se ejecuta:
  · Para cada participant confirmado en esa jornada:
    - flight_id = NULL
    - lead_status = 'RESCHEDULE_NEEDED'
    - operational_status = 'WEATHER_CANCELLED'
    ↓
Esos leads aparecen en /reservas con badge "Reagendar" para que el staff los redistribuya
```

### 4.7 Reagendar un lead ya confirmado o con RESCHEDULE_NEEDED

```
Desde /reservas → click "Reagendar"
    ↓
Sistema:
  1. Libera plaza: flight_id = NULL, lead_status = 'NEW'
  2. Si el vuelo queda vacío, lo elimina
  3. Abre modal de selección de fecha (mismo que Caso C)
  4. Asigna al nuevo slot
```

---

## 5. Nueva Página: `/reservas`

### 5.1 Estructura de tabs

```
/reservas
├── Tab "Pendientes"    → lead_status IN ('NEW', 'TENTATIVE', 'RESCHEDULE_NEEDED')
├── Tab "Confirmadas"   → lead_status = 'CONFIRMED'
└── Tab "Canceladas"    → lead_status IN ('CANCELLED', 'NO_SHOW')
```

### 5.2 Layout de la tab "Pendientes"

```
┌─────────────────────────────────────────────────────────────────────┐
│  RESERVAS                                          [+ Nueva Reserva] │
├─────────────────────────────────────────────────────────────────────┤
│  [Pendientes 12] [Confirmadas 34] [Canceladas 5]                    │
├──────────┬──────────┬───────┬──────────┬───────────────┬───────────┤
│ CLIENTE  │ FECHA    │ HORA  │ GRUPO    │ DISPONIBILIDAD│ ACCIÓN    │
├──────────┼──────────┼───────┼──────────┼───────────────┼───────────┤
│ Juan L.  │ 22 Jun   │ 10:00 │    –     │ ✅ Libre      │[Confirmar]│
│ Ana G.   │ 22 Jun   │ 10:00 │ 👥 x2 ↓ │ ⛔ Lleno      │[Reagendar]│
│ Pedro R. │ 22 Jun   │ 10:00 │ 👥 x2 ↑ │ ⛔ Lleno      │[Reagendar]│
│ María S. │ 25 Jun   │  –    │    –     │ ✅ Libre      │[Confirmar]│
│ Luís M.  │ 15 Ago   │ 16:00 │    –     │ 🟡 Tentativa  │[Confirmar]│
│ Rosa P.  │ (sin fecha)│  –  │    –     │ ⏳ Sin fecha  │[Completar]│
└──────────┴──────────┴───────┴──────────┴───────────────┴───────────┘
```

**Nota sobre grupos**: ↓↑ indica que Ana G. y Pedro R. vienen juntos. Al expandir el grupo se ven todos sus miembros. El staff sabe que hay que intentar ubicarlos en el mismo vuelo.

### 5.3 Indicadores de disponibilidad

| Badge | Significado |
|-------|-------------|
| ✅ `Libre` (verde) | La fecha tiene plazas en el mes actual. Se confirma con 1 click asignando `flight_id` real. |
| 🟡 `Tentativa` (ámbar) | La fecha es de un mes futuro. Al confirmar queda `TENTATIVE` sin plaza, y se auto-promueve al llegar ese mes. |
| ⛔ `Conflicto` (rojo) | La fecha está al tope de capacidad. Hay que reagendar. |
| ⚠️ `Reagendar` (naranja) | `RESCHEDULE_NEEDED`: la jornada fue cancelada (meteo u otro). Requiere nueva fecha. |
| ⏳ `Sin fecha` (gris) | El lead no tiene `preferred_date`. El staff debe completar sus datos. |

---

## 6. Integración con el Manifest Existente

El manifest actual (`/[date]`) no cambia su funcionamiento. La integración es completamente transparente:

- Los participantes confirmados desde reservas aparecen en el manifest exactamente igual que los creados directamente.
- El `AddParticipantDrawer` existente se adapta con un parámetro `mode?: 'participant' | 'lead'` para reutilizarlo en ambos contextos.
- Badge discreto opcional en `ParticipantRow`: si `participant.lead_status = 'CONFIRMED'` y `channel != 'STAFF'`, mostrar un pequeño badge "Web" o "Bot" para que el staff sepa el origen.
- Al cancelar meteorología una jornada, se activa automáticamente `handleWeatherCancellation` que libera las plazas y marca esos leads como `RESCHEDULE_NEEDED`.

---

## 7. API para el Bot

### Autenticación

Header `X-API-Key: <key>`. El middleware valida con `sha256(key)` contra `api_keys.key_hash`. Nunca se guarda el key en plaintext.

### Endpoints

#### `GET /api/bot/v1/availability?from=YYYY-MM-DD&limit=6`
Devuelve los próximos N días con plazas libres.
```json
{
  "slots": [
    { "date": "2026-06-28", "freeSeats": 8, "classification": "CONFIRMABLE" },
    { "date": "2026-06-29", "freeSeats": 20, "classification": "CONFIRMABLE" },
    { "date": "2026-07-05", "freeSeats": 20, "classification": "TENTATIVE_ONLY" }
  ]
}
```

#### `GET /api/bot/v1/availability/day?date=YYYY-MM-DD`
Detalle de disponibilidad de un día concreto.

#### `POST /api/bot/v1/reservations`
Crea un lead. Si la fecha está llena, devuelve 409 con fechas alternativas sugeridas.
```json
// Request
{
  "fullName": "Juan López",
  "phone": "+34612345678",
  "email": "juan@example.com",
  "weight": 75,
  "packageType": "SOLO",
  "preferredDate": "2026-06-28",
  "preferredTime": "10:00",
  "source": "DIRECT",
  "notes": ""
}

// Response 201
{
  "participantId": "uuid-xxx",
  "token": "uuid-yyy",
  "status": "NEW",
  "dateClassification": "CONFIRMABLE",
  "statusUrl": "/reserva/uuid-yyy"
}

// Response 409 (fecha llena)
{
  "error": { "code": "unavailable", "message": "El 28 de junio está completo." },
  "suggestedDates": ["2026-06-29", "2026-07-05"]
}
```

#### `GET /api/bot/v1/reservations/{idOrToken}`
Consulta el estado de una reserva. El bot puede mostrar esto al cliente si pregunta.

### Rate limiting

Contador por ventana fija en `api_rate_limits`. Si se supera `rate_limit_per_min`, responde 429 con header `Retry-After`.

---

## 8. Cron: Promoción de Leads Tentativos

`src/app/api/cron/promote-leads/route.ts` — se ejecuta diariamente.

Lógica:
1. Busca leads con `lead_status = 'TENTATIVE'` cuyo `preferred_date` esté en el mes actual.
2. Para cada uno, intenta `confirmLead` (RPC `reservations_assign_seat`).
3. Si hay plaza → `CONFIRMED` con `flight_id`.
4. Si no hay plaza → `RESCHEDULE_NEEDED` (aparece en /reservas para que el staff lo gestione).

---

## 9. Fixes Necesarios Previos a la Implementación

### 9.1 Variable de entorno mal nombrada (seguridad)

En `.env.local` existe `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. El prefijo `NEXT_PUBLIC_` hace que esta key se exponga al cliente en el bundle de JavaScript. Aunque `service.ts` ya lee correctamente `SUPABASE_SERVICE_ROLE_KEY`, la variable del `.env.local` debe renombrarse **antes** de activar la API del bot (que usa el service client activamente). Con el service client activo, una fuga de esta key supone compromiso total de la BD.

### 9.2 `proxy.ts` intercepta rutas de API

El middleware actual (`proxy.ts`) redirige a `/login` todo lo que no sea público. Esto **rompe** los endpoints del bot (recibirían un 307 HTML en vez de JSON) y el futuro webhook de Stripe. Hay que añadir un early-return:

```typescript
// En proxy.ts, antes de la lógica de auth:
if (pathname.startsWith('/api/') || pathname.startsWith('/reserva/')) {
  return NextResponse.next()
}
```

---

## 10. Archivos a Crear y Modificar

### Nuevos archivos

```
supabase/migrations/
└── 20260620000000_reservations.sql
    → campos en participants, campos en reservation_groups,
      tablas api_keys / api_rate_limits / business_settings, RLS, ROLLBACK

src/lib/availability/
├── availability-engine.ts         ← lógica pura sin I/O (testeable)
└── __availability_check.mts      ← tests de regresión vía jiti (como __pnl_check.mts)

src/lib/actions/
├── leads.ts                       ← createLead, confirmLead, rescheduleLead, cancelLead,
│                                    listLeads, handleWeatherCancellation, promoteTentativeLeads
└── availability.ts                ← getPolicy, getDayAvailability, getMonthAvailability,
                                     listNextAvailableSlots

src/lib/api/
├── auth.ts                        ← middleware validación X-API-Key
└── rate-limit.ts                  ← bump_rate_limit con ventana fija en api_rate_limits

src/app/api/bot/v1/
├── availability/route.ts
├── availability/day/route.ts
└── reservations/
    ├── route.ts                   ← POST crear lead
    └── [idOrToken]/route.ts       ← GET estado

src/app/api/cron/
└── promote-leads/route.ts         ← cron diario de promoción de tentativas

src/app/reservas/
├── page.tsx
└── components/
    ├── ReservationsView.tsx        ← tabs Pendientes / Confirmadas / Canceladas
    ├── ReservationRow.tsx          ← fila: datos + badge disponibilidad + botón acción
    ├── ReservationStatusBadge.tsx  ← badge visual (Libre / Tentativa / Conflicto / etc.)
    ├── ConfirmReservationModal.tsx ← Casos A y B: confirmar con fecha/hora
    ├── RescheduleReservationModal.tsx ← Caso C: mini-calendario con clasificación de fechas
    └── WeekendAvailabilityCalendar.tsx ← calendario con colores por clasificación
```

### Archivos existentes a modificar

```
src/proxy.ts
└── Early-return para /api/* y /reserva/* (fix crítico)

src/types/domain.ts
└── LeadStatus type, Channel type, extender Participant con nuevos campos,
    LeadWithDetails, AvailabilityResult, DaySlots, DateClass, BusinessSetting

src/lib/supabase/database.types.ts
└── Extender manualmente con las 3 tablas nuevas y columnas añadidas
    (regenerar con CLI tras aplicar la migración)

src/lib/actions/participant.ts
└── createParticipant(flightId: string | null, data) — relajar flightId a nullable
    freeSeat(id) — helper para liberar plaza (flight_id = NULL)

src/app/[date]/components/AddParticipantDrawer.tsx
└── Añadir mode?: 'participant' | 'lead' para reutilizar en /reservas

src/app/[date]/components/ParticipantRow.tsx
└── Badge discreto "Bot"/"Web" si channel != 'STAFF' y lead_status = 'CONFIRMED'

src/components/layout/AppSidebar.tsx  (o ruta equivalente)
└── Enlace "Reservas" en navegación, entre "Hoy" y "Finanzas"
    Badge numérico con count de leads en estado NEW o RESCHEDULE_NEEDED

.env.local (y Vercel)
└── Renombrar NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY → SUPABASE_SERVICE_ROLE_KEY
```

---

## 11. Orden de Implementación

| Fase | Tarea |
|------|-------|
| **R1 — Base** | Fix `.env.local` + fix `proxy.ts` + migración SQL + regenerar tipos + extender `domain.ts` |
| **R2 — Motor** | `availability-engine.ts` + tests + wrappers `availability.ts` |
| **R3 — Ciclo de vida** | `leads.ts` (createLead, confirmLead, cancelLead, listLeads) + RPC Postgres `reservations_assign_seat` + relajar `participant.ts` |
| **R4 — UI** | Página `/reservas` + tabs + `ReservationRow` + badges de disponibilidad |
| **R5 — Acciones UI** | `ConfirmReservationModal` + `RescheduleReservationModal` + `WeekendAvailabilityCalendar` |
| **R6 — Drawer** | `AddParticipantDrawer` con `mode='lead'` para alta manual en /reservas |
| **R7 — Sidebar** | Enlace "Reservas" + badge de pendientes en `AppSidebar` |
| **R8 — Meteo** | `handleWeatherCancellation` cableado a `updateOperationalDay` + badge en manifest |
| **R9 — Cron** | `promoteTentativeLeads` + endpoint cron |
| **R10 — API bot** | Middleware auth + rate-limit + endpoints `/api/bot/v1/...` |

---

## 12. Decisiones Pendientes de Confirmación

| # | Decisión | Quién confirma |
|---|----------|----------------|
| 1 | ¿Solo opera en fines de semana? (`operating_weekdays = '6,0'`) | Raúl |
| 2 | Capacidad real: `max_flights_per_day` (el plan asume 10) | Raúl |
| 3 | ¿Se confirma a Ricardo el acceso de escritura al repo del software para coordinar la API? | Ricardo + hermano |

---

## 13. Fuera de Alcance (Fase Posterior)

- **Pago online con Stripe**: depósito de reserva, webhook, sesiones de pago. Cuando se implemente, solo habrá que añadir la tabla `payment_sessions`, la lógica de Stripe y el estado `AWAITING_PAYMENT`. El modelo de datos actual ya lo permite sin cambios estructurales.
- **Notificaciones al cliente** (email/WhatsApp al confirmar o reagendar).
- **Multi-staff con trazabilidad** de quién confirmó cada reserva (`confirmed_by` FK a users).
- **Política de reembolso** y adaptación del copy del bot al modelo tentativa.
