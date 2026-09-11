# Plan Maestro — Sistema de Reservas iJump (Lead → Pago → Manifest) + Integración del Chatbot

> **Autor:** Claude (Opus), actuando como CTO de Edrai para iJump · **Fecha:** 2026-06-20
> **Lo ejecuta:** el hermano (alepm03) en su Claude. Está escrito para leerse **en frío**, sin contexto previo.
> **Naturaleza:** plan estratégico + técnico. Incluye decisiones ya tomadas (CTO) y las que requieren validación humana (marcadas 🔵).

---

## 0. Resumen ejecutivo (TL;DR)

Hoy iJump tiene **dos sistemas desconectados**: el **software operativo** (manifiesto del día, finanzas; repo del hermano, Supabase del hermano) y el **chatbot** (web + WhatsApp pendiente; repo de Ricardo, Supabase de Ricardo, orquestado por n8n). El chatbot **crea leads en su propia base de datos** y todo lo demás (cobro, asignación de fecha, confirmación) lo hace **Raúl a mano**. La reserva está fragmentada y es manual.

**La visión:** que los chatbots (web y WhatsApp) puedan **crear una reserva, cobrar el depósito online, sugerir fecha y asignar fecha/hora por disponibilidad** (siempre intra-mes), y que esa reserva sea **el mismo registro** que luego aparece en el manifiesto.

**Decisión CTO central:** el **software operativo es el sistema de registro (system of record)**. Una reserva ES un futuro participante (misma fila en `participants`). El chatbot pasa a ser un **canal** que llama a una **API del software**; deja de tener su propia cola de reservas y deja de depender de pasos manuales. El pago (Stripe) y la lógica de disponibilidad viven en el software. Se mantienen **dos repos y dos proyectos Supabase** (separación por dominio y propiedad), integrados por **API**, no por base de datos compartida.

Programa en **6 fases** (R0 organización → R5 hardening). El núcleo software es aditivo y reversible (misma disciplina que el módulo de finanzas v2 recién entregado).

---

## 1. Contexto y por qué

- **Software operativo** (`alepm03/ijump-software`, Next.js 16 + Supabase): gestiona el manifiesto diario (jornadas, vuelos, participantes, pagos) y, desde el PR #20, el módulo financiero v2. Es donde se cumple la reserva. **No tiene pago online** (excluido del MVP).
- **Chatbot** (`ricardopm01/ijump-agente-ia`): widget Vue en la web Wix → Vercel Edge (gateway) → **n8n** (en VPS Hetzner) que orquesta el LLM (OpenAI gpt-4o-mini) → Supabase del chatbot. Recoge datos del cliente y crea un "lead" en su tabla `bot_reservations_inbox`. WhatsApp inbound está a medio construir (esqueleto, sin IA cableada, pendiente de SIM + alta en Meta).
- **El gap:** el cliente que reserva por el bot acaba en una tabla del chatbot, separada de los participantes del software. El cobro es una transferencia manual a un IBAN que Raúl verifica a ojo; la fecha la asigna Raúl. No hay disponibilidad real ni confirmación automática.

**Lo que esto desbloquea:** reservas de extremo a extremo sin intervención manual, con cobro garantizado antes de ocupar plaza, y una sola fuente de verdad del cliente desde el lead hasta el salto.

---

## 2. Estado actual de los dos sistemas (verificado)

### 2.1 Software — lo que ya nos sirve (reutilizar, no reinventar)
- `participants.flight_id` **ya es nullable** (FK `ON DELETE SET NULL`). Un lead = participante con `flight_id IS NULL`. **No hace falta tabla de leads ni migración de datos al confirmar** (principio "una sola entidad").
- `reservation_groups` ya agrupa comercialmente (con `source`). Sirve para parejas/grupos; **no se necesita una tabla `lead_groups` aparte** (mejora sobre el plan preliminar).
- `payments` ya modela dinero con `method` (`TARJETA`/`BIZUM`/`TRANSFERENCIA`) y `stage` (`RESERVA` = el depósito). El depósito pagado es una fila `payments` normal con `stage='RESERVA'` y entra en el P&L sin casos especiales.
- Patrones reutilizables: Server Actions (`src/lib/actions/*.ts`), el flujo público con token + service client del **waiver** (`src/app/waiver/[token]`, `src/lib/actions/waiver.ts`) como plantilla del flujo público de pago, `createFlight` (count→número+1) para "buscar o crear vuelo", `AddParticipantDrawer` como formulario reutilizable, `src/lib/supabase/service.ts` (único cliente que salta RLS) para la API del bot.
- Migración aditiva/reversible: plantilla en `supabase/migrations/20260607000000_waiver_documents.sql` (usa `ADD COLUMN` + `CHECK` en vez de enums de Postgres, porque `ALTER TYPE ADD VALUE` no es reversible) y `20260618000000_finance_v2.sql` (RLS + bloque ROLLBACK).
- **Sin infra de pago.** Solo una API route hoy (`finanzas/export`). `proxy.ts` redirige todo lo no-público a `/login` (problema para la API del bot, ver §7/§12).

### 2.2 Chatbot — evaluación CRÍTICA (Ricardo pidió ser duro aquí)
Lo bueno: el widget Vue (<42KB, accesible), el Vercel Edge (rate-limit + CORS), Supabase y n8n son decisiones razonables; el código está organizado y documentado; ~80% del MVP construido.

Lo que **hay que replantear** (no es deuda menor, es estructural):
1. **Sin pago online.** El flujo es "transfiere 60€ a este IBAN y te contactamos". Bloquea cualquier SLA y la automatización. **Crítico.**
2. **Sin disponibilidad real.** La tool `consultar_disponibilidad` solo escala a humano; el bot no conoce el calendario. **Alto.**
3. **Sin asignación/confirmación de fecha automática.** Lo hace Raúl a mano. **Alto.**
4. **Modelo de "fecha tentativa" ambiguo.** Reserva a futuro queda "tentativa" sin mecanismo de auto-confirmación cuando llega el mes. Mala UX. (Lo resolvemos en §8.)
5. **Fragilidad operativa grave:** los exports de los workflows n8n están **incompletos** (faltan conexiones `ai_*`); reimportar desde el repo **rompe el agente en vivo** → la única fuente de verdad es la instancia viva. Migraciones S21 (5 tablas WhatsApp) **no aplicadas a producción**. Datos de prueba mezclados con 4 clientes reales. **Crítico para continuidad.**
6. **Google Sheets como "CRM".** Sin integridad referencial. A eliminar (el software pasa a ser el CRM).
7. **Sin observabilidad:** sin Sentry, sin alertas, sin uptime. Fallos silenciosos. **Alto.**
8. **Versionado KB/prompts manual y a la deriva** (la tabla `kv` dice v9 pero el contenido es v10). Sin CI de despliegue.
9. **Bloqueos legales:** política de reembolso (R4) sin cerrar, política de privacidad sin publicar en Wix, DPA Edrai↔iJump sin firmar, EIPD sin presentar. **Pedir un pago sin T&C de reembolso cerrados es un riesgo legal. Bloqueante.**
10. **n8n en VPS de terceros sin plan de recuperación** (single point of failure). **Alto.**

### 2.3 Organización actual de infra (el quid CTO)
| | Software | Chatbot |
|---|---|---|
| Repo GitHub | `alepm03/ijump-software` (hermano) | `ricardopm01/ijump-agente-ia` (Ricardo) |
| Supabase proyecto | `ojngrplnuhcenulfnfps` | `rdggwemryhcscevoidrl` |
| Cuenta/Org Supabase | org `ijump` del **hermano** | org de **Ricardo/Edrai** |
| Deploy | Vercel (pendiente de prod) | Vercel (widget+edge) + n8n en Hetzner |

**Problema:** dos cuentas GitHub + dos cuentas Supabase distintas. Hoy **no hay integración**; las reservas viven en la BD del chatbot (Ricardo), separadas de los participantes (BD del hermano). Ricardo no puede pushear al repo del software; el MCP de Supabase solo ve la org del hermano.

---

## 3. Decisiones de arquitectura (CTO — ya tomadas)

1. **El software es el sistema de registro.** Reservas, leads, pagos y disponibilidad viven en la **BD del software** (`ojngrplnuhcenulfnfps`). Una reserva = participante con `flight_id NULL` + ciclo de vida de lead. Confirmar = asignar `flight_id` (sin mover datos).
2. **El chatbot es un canal, no un sistema paralelo.** Deja de guardar reservas en su BD; llama a la **API de reservas del software** para crear, consultar disponibilidad, generar enlace de pago y leer estado. `bot_reservations_inbox` queda deprecada (se conserva histórico, no se escribe más como fuente de verdad).
3. **El pago (Stripe) vive en el software** (system of record del dinero). El bot solo muestra el enlace de Checkout. Webhook → marca depósito pagado → asigna/bloquea fecha.
4. **La política de disponibilidad e intra-mes vive en el software** (es quien posee vuelos y jornadas). El bot la consulta por API.
5. **Migración aditiva y reversible.** Misma disciplina que finanzas v2: `ADD COLUMN`/tablas nuevas, RLS, bloque ROLLBACK, tipos a mano + regenerar. Cero riesgo sobre datos existentes.
6. **Integración por contrato de API versionado** (`/api/bot/v1/...`), no por BD compartida ni por monorepo.

---

## 4. Organización de proyectos e infra (CTO — recomendación y plan)

Ricardo lo marca como prioritario. Mi recomendación, con razonamiento:

### 4.1 Repos: **mantener DOS repos, integrar por API**
- Software y chatbot son servicios distintos, con dueños, cadencias de deploy y stacks distintos. Un monorepo sería un refactor grande y arriesgado sin beneficio real y enturbiaría la propiedad.
- **Acción:** formalizar el límite (el software expone la API de reservas; el chatbot la consume) y **arreglar el acceso asimétrico**: invitar a ambos como colaboradores en **ambos** repos (hoy Ricardo no puede pushear al software). 🔵 Decisión de acceso: hermano + Ricardo se dan acceso de escritura mutuo.

### 4.2 Supabase: **mantener DOS proyectos, con fronteras de datos claras**
- **BD del software** (del hermano) = fuente de verdad operativa **+ reservas + pagos** (lo nuevo de este plan).
- **BD del chatbot** (de Ricardo) = solo estado conversacional: historial de chat, KB/prompts (`kv`), `bot_flags`, tablas de WhatsApp. **Deja de almacenar reservas.**
- Esto **elimina el silo de las reservas** (el problema real) sin la complejidad de migrar cuentas. La integración es por API, así que no necesitan estar en el mismo proyecto.
- **Acción:** cross-invitar ambas cuentas como miembros de las dos orgs Supabase (para visibilidad/MCP/dev). 🔵

### 4.3 Largo plazo (no bloquea este plan) 🔵
La infra del negocio no debería depender de cuentas personales (la BD del chatbot está en la cuenta personal de Ricardo/Edrai). **Recomendación futura:** consolidar toda la infra iJump (ambos Supabase, ambos repos, Vercel) bajo **una org de empresa** (GitHub org `ijump-skydive` + una sola cuenta/org Supabase de empresa). Es una migración a planificar aparte; ahora solo se deja el acceso cruzado. Decisión de negocio (a quién pertenece la infra) que deben tomar Ricardo y su hermano.

### 4.4 n8n
Mantener n8n como orquestador (cambiarlo sería reescribir el bot). Pero **mitigar el single-point-of-failure**: exportar workflows completos (con conexiones `ai_*`), documentar recuperación, y mover el token de n8n a gestor de secretos. (Workstream del lado chatbot, §10.)

---

## 5. Modelo de datos y módulo de reservas (software)

**Migración nueva:** `supabase/migrations/20260620000000_reservations.sql` (timestamp posterior a finanzas v2). **Aditiva y reversible.**

### 5.1 Cambios (todos opcionales/`DEFAULT` → filas existentes intactas)
- **`participants`** (ciclo de vida del lead): `lead_status TEXT` con `CHECK (... IN ('NEW','AWAITING_PAYMENT','TENTATIVE','CONFIRMED','CANCELLED','EXPIRED','RESCHEDULE_NEEDED'))` (TEXT+CHECK, **no enum**, por reversibilidad); `preferred_date DATE`, `preferred_time TIME`, `confirmed_date DATE` (denormalizada para listar rápido), `deposit_paid BOOLEAN DEFAULT FALSE`, `deposit_amount NUMERIC(10,2)`, `channel TEXT DEFAULT 'STAFF'` con `CHECK IN ('WEB_BOT','WHATSAPP_BOT','STAFF')`, `created_by TEXT`, `lead_expires_at TIMESTAMPTZ`, y **`token UUID DEFAULT gen_random_uuid() UNIQUE`** (para la página pública de pago/estado sin exponer el UUID PK, igual que waivers). Índices parciales en `lead_status`, `preferred_date`, `confirmed_date`.
  - `lead_status` (comercial, pre-vuelo) es **ortogonal** a `operational_status` (operativo, post-confirmación). Un lead vive en `lead_status` hasta confirmar; al asignar `flight_id` entra en el flujo `operational_status` normal.
- **`reservation_groups`** (reutilizada para grupos): `contact_phone`, `contact_email`, `channel`, `created_by`.
- **`payment_sessions`** (nueva): ciclo de Stripe Checkout fuera de `payments` para que se mantenga "payments = lo COBRADO". Campos: `participant_id`, `stripe_session_id UNIQUE`, `stripe_payment_intent_id UNIQUE`, `amount`, `currency`, `status` (`PENDING/PAID/EXPIRED/FAILED/REFUNDED`), `checkout_url`, `payment_id` (FK a la fila real de `payments`, se rellena al pagar). Al `checkout.session.completed`, el webhook **inserta la fila real en `payments`** (`stage='RESERVA'`, `method='TARJETA'|'BIZUM'`) y la enlaza.
- **`stripe_events`** (nueva): ledger de idempotencia del webhook (`id TEXT PRIMARY KEY` = `event.id` de Stripe).
- **`api_keys`** (nueva): auth del bot. Solo guarda `key_hash` (sha256), `key_prefix`, `scopes TEXT[]`, `rate_limit_per_min`, `active`, `last_used_at`, `revoked_at`. Nunca plaintext.
- **`api_rate_limits`** (nueva): contador ventana-fija en BD (sin dependencia de Redis): PK `(api_key_id, window_start)`, `count`.
- **`business_settings`** (nueva, key/value): `max_flights_per_day` (🔵 parámetro de negocio, **nunca hardcodear** — el plan preliminar asumía 10/día=20 saltos; confirmar con Raúl la capacidad real), `max_clients_per_flight` (2), `deposit_amount_eur` (60), `operating_weekdays` (Sáb/Dom), `default_first_flight_time`, `lead_hold_minutes`.

### 5.2 RLS
Misma postura que el resto (`authenticated full access`) en `payment_sessions`, `business_settings`, lectura de `api_keys` para el admin. **`api_keys`/`stripe_events`/`api_rate_limits` sin política `authenticated`** → RLS deniega por defecto; solo el service client (webhook + middleware del bot) las toca (son secretos, no datos de app). Bloque ROLLBACK completo (drop de tablas/columnas nuevas; nada destructivo sobre lo viejo).

### 5.3 Tipos
Hand-extend `src/lib/supabase/database.types.ts` y `src/types/domain.ts` (`LeadStatus`, `Channel`, `PaymentSessionStatus`, `PaymentSession`, `ApiKey`, `BusinessSetting`, extender `Participant`, `LeadWithDetails`). 🔵 Paso humano: regenerar `database.types.ts` desde la BD tras aplicar (igual que finanzas v2).

### 5.4 Ciclo de vida + server actions (`src/lib/actions/leads.ts`)
`createLead` (inserta participante con `flight_id NULL`), `confirmLead(leadId, date)` (re-chequea disponibilidad, exige que la fecha sea CONFIRMABLE = mes actual, busca-o-crea jornada+vuelo con plaza, asigna `flight_id`, pasa a `CONFIRMED`), `rescheduleLead`, `cancelLead`, `listLeads`, `handleWeatherCancellation(dayId)` (al marcar jornada `weather_status='CANCELLED'`: libera plazas, marca `RESCHEDULE_NEEDED`), `promoteTentativeLeads(today?)` (cron diario: promueve tentativas cuyo mes ya llegó).
- **Concurrencia (importante):** la asignación de plaza (buscar/crear vuelo + asignar) debe ir en una **función Postgres `reservations_assign_seat(lead_id, date)` con `SELECT ... FOR UPDATE`** sobre los vuelos del día, llamada por `supabase.rpc()`. El re-chequeo en JS solo no evita la sobreventa con dos confirmaciones simultáneas.
- Modificar `src/lib/actions/participant.ts`: `createParticipant(flightId: string | null, data)` (relajar a nullable), añadir campos de lead, helper `freeSeat(id)`. `AddParticipantDrawer` con `mode?: 'participant' | 'lead'` para alta manual de reservas por staff.

---

## 6. Pago online (Stripe)

**Dependencia nueva:** `stripe` (SDK server). Recomendado sobre Redsys/PayPal por DX y por soportar en España **tarjeta + Bizum + SEPA**.

- `src/lib/stripe/client.ts` (instancia con `STRIPE_SECRET_KEY`).
- `createDepositCheckout(leadId)`: crea fila `payment_sessions` (`PENDING`) → crea Stripe Checkout Session (`mode:'payment'`, `payment_method_types:['card','bizum']`, `metadata:{ lead_id, payment_session_id }`, `success_url`/`cancel_url` a `/reserva/{token}`, `expires_at`) → guarda `stripe_session_id`+`checkout_url` → `lead_status='AWAITING_PAYMENT'` → devuelve `checkout_url`.
- **Webhook** `src/app/api/webhooks/stripe/route.ts`: leer **raw body** (`await req.text()`), `stripe.webhooks.constructEvent(...)` con `STRIPE_WEBHOOK_SECRET` (rechazar 400 si falla). **Idempotencia triple:** (a) `INSERT stripe_events(id)` → si choca (23505), ya procesado, 200; (b) `payment_sessions.status='PAID'` corta reentradas; (c) insertar `payments` solo si `payment_sessions.payment_id IS NULL`. En `checkout.session.completed`: insertar `payments` (`stage='RESERVA'`), marcar sesión `PAID`, `deposit_paid=true`, y **auto-confirmar por disponibilidad** (RPC `reservations_assign_seat` para `preferred_date`: si CONFIRMABLE → `CONFIRMED`+vuelo; si futuro → `TENTATIVE`; si la fecha se llenó → `RESCHEDULE_NEEDED`). Todo con **service client**.
- Página pública `src/app/reserva/[token]/page.tsx` (clon del flujo waiver) que muestra el resultado al cliente.
- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`. **Bloqueante previo:** arreglar el footgun `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` (renombrar a sin prefijo) antes de usar activamente el service client en API/webhook (una fuga de la service key = compromiso total).

---

## 7. API para los bots (contrato)

Route Handlers en `src/app/api/bot/...`, **runtime nodejs**, **service client**, auth por **`X-API-Key`** (se valida `sha256(key)` contra `api_keys`), rate-limit por clave (tabla `api_rate_limits` + función `bump_rate_limit`), validación Zod, modelo de error `{ error: { code, message } }` (códigos `unauthorized|rate_limited|validation_error|not_found|unavailable|conflict|internal`; nunca filtrar errores internos).

- **`POST /api/bot/v1/reservations`** → crea lead + Checkout. Devuelve `{ reservationId, token, status:'AWAITING_PAYMENT', depositAmount, paymentUrl, dateClassification, statusUrl }`. Si la fecha es `UNAVAILABLE` → 409 con `suggestedDates`.
- **`GET /api/bot/v1/availability?from=&limit=`** → `{ slots:[{date, freeSeats, classification}] }` (CONFIRMABLE/TENTATIVE_ONLY). Y `/availability/day?date=`.
- **`POST /api/bot/v1/reservations/{id}/payment-link`** → reemite enlace (idempotente: reusa sesión PENDING viva).
- **`GET /api/bot/v1/reservations/{idOrToken}`** → estado.
- **`proxy.ts` debe hacer early-return para `pathname.startsWith('/api/')`** y permitir `/reserva/` como ruta pública (si no, el bot recibe redirects HTML y el webhook de Stripe se rompe).

---

## 8. Disponibilidad + política intra-mes / tentativa (resuelta)

Motor **puro y testeable** (`src/lib/availability/availability-engine.ts`, sin I/O, como `pnl-engine.ts`) + wrappers de acción (`src/lib/actions/availability.ts`). Reglas: solo fines de semana, ≤2 clientes/vuelo, ≤`max_flights_per_day` (de `business_settings`), meteo (`weather_status='CANCELLED'` → 0 plazas).

**Modelo de fecha de dos niveles (resuelve la ambigüedad del plan preliminar):**
- **CONFIRMADA (solo mes actual):** lead con depósito pagado y `flight_id` en una fecha del mes en curso. Ocupa plaza real.
- **TENTATIVA (meses futuros):** `lead_status='TENTATIVE'`, `preferred_date` fijada, **`flight_id` NULL**, el depósito puede estar pagado (compró "un salto", no aún "una plaza el día X"). No consume disponibilidad.
- **Auto-promoción:** cron diario `promoteTentativeLeads`: cuando el mes preferido pasa a ser el actual, intenta confirmar (asigna vuelo) o, si está lleno, marca `RESCHEDULE_NEEDED` y re-engancha al cliente (vía bot/staff). Así "tentativa" es un estado real y resoluble, no una nota ambigua.

`classifyDate(target, today, slots)` → `CONFIRMABLE | TENTATIVE_ONLY | UNAVAILABLE | NOT_OPERATING`. `listNextAvailableSlots` camina fines de semana hacia delante (lo que el bot llama para "sugerir fechas").

---

## 9. UI `/reservas`
Reutiliza el design system (tokens CLAUDE.md, primitivos shadcn) y el patrón de finanzas v2. `src/app/(dashboard)/reservas/page.tsx` (server) + `ReservationsView` (tabs Pendientes/Confirmadas/Canceladas), `ReservationStatusBadge`, `ConfirmReservationModal` y `RescheduleReservationModal` (con `WeekendAvailabilityCalendar`: verde=CONFIRMABLE, ámbar=TENTATIVE_ONLY, gris=lleno/cerrado), reutilizar `AddParticipantDrawer` en `mode='lead'` para alta manual, y entrada "Reservas" en `AppSidebar` (entre "Hoy" y "Finanzas", patrón de estado activo existente).

---

## 10. Replanteamiento e integración del chatbot (lado Ricardo / coordinación)

El bot pasa de "recoge datos y Raúl hace el resto" a **canal autónomo** que orquesta reserva+pago+fecha vía la API del software. Cambios:
1. **Rewire `crear_reserva`** (n8n) → `POST /api/bot/v1/reservations` del software (devuelve `paymentUrl` + clasificación de fecha). Dejar de escribir `bot_reservations_inbox` como fuente de verdad.
2. **Cablear `consultar_disponibilidad`** → `GET /api/bot/v1/availability` (disponibilidad real, fin del "te contactaremos").
3. **Mostrar el enlace de pago Stripe** en el chat (sustituye el "transfiere al IBAN").
4. **Sugerencia + confirmación de fecha** desde la API; el bot comunica CONFIRMADA o TENTATIVA.
5. **WhatsApp:** completar S21 (cablear el agente IA + memoria) y consumir la **misma** API. Una sola lógica de reservas para web y WhatsApp.
6. **Decommission de Google Sheets** como CRM (el software pasa a serlo).
7. **Migración puntual de las 4 reservas reales** que hoy viven en `bot_reservations_inbox`: crear sus participantes-lead equivalentes en el software (one-off, vía la API o un script). El resto de filas (≈20 de prueba) se descartan. `bot_reservations_inbox` se conserva como histórico de solo lectura.

**Fixes críticos del chatbot (bloquean producción del flujo de pago):**
- 🔵 **Cerrar la política de reembolso/cancelación (R4)** y **publicar privacidad/T&C en Wix** antes de cobrar (legal + GDPR).
- Aplicar las migraciones S21 a la BD viva; limpiar datos de prueba.
- **Arreglar la recuperabilidad de n8n** (exports completos con conexiones `ai_*`, documentar DR, token a secret manager).
- Añadir **observabilidad** (Sentry + uptime + alerta en fallo de workflow) y CI de versionado de KB/prompts.
- Firmar el **DPA Edrai↔iJump** y presentar la EIPD.

---

## 11. Fases del programa (con propietario)

| Fase | Contenido | Propietario |
|---|---|---|
| **R0 — Organización** | Acceso cruzado repos + Supabase; acordar el contrato de API; abrir cuenta Stripe (test); confirmar `max_flights_per_day` y capacidad real con Raúl; cerrar R4 (reembolso) | Ricardo + hermano |
| **R1 — Datos + disponibilidad (software, MVP)** | Migración aditiva; tipos; motor de disponibilidad + tests; `createLead/confirmLead/cancelLead/listLeads`; `/reservas` con confirmación manual por staff | Hermano |
| **R2 — API del bot (lectura + creación)** | `api_keys` + middleware + rate-limit + Zod; `GET /availability`, `POST /reservations` (sin pago aún), `GET /reservations/{id}` | Hermano |
| **R3 — Pago Stripe** | `createDepositCheckout`; webhook + idempotencia; página pública `/reserva/[token]`; `AWAITING_PAYMENT → CONFIRMED` | Hermano |
| **R4 — Tentativa/promoción + meteo** | cron `promoteTentativeLeads`; `handleWeatherCancellation`; reagendar; `RESCHEDULE_NEEDED` | Hermano |
| **R5 — Chatbot: integración** | rewire n8n a la API; enlace de pago en chat; disponibilidad real; WhatsApp S21; quitar Google Sheets | Ricardo (con contrato de R2/R3) |
| **R6 — Hardening + legal** | RLS por rol; observabilidad bot; DR n8n; R4/privacidad/DPA/EIPD; limpieza datos prueba | Ambos |

Orden recomendado: R0 → (R1+R2 en paralelo con que Ricardo prepare R5) → R3 → R4/R5 → R6. **R1–R4 son aditivas y no rompen el software en producción.**

---

## 12. Seguridad, legal, observabilidad
- **Arreglar el footgun `NEXT_PUBLIC_SERVICE_ROLE_KEY` ANTES de R2/R3** (renombrar en `.env.local` + Vercel). Con el service client activo en API/webhook, una fuga = compromiso total.
- `proxy.ts`: saltar `/api/`, permitir `/reserva/`.
- API keys hasheadas, scopes por ruta, rotación/revocación. Webhook con verificación de firma obligatoria + idempotencia. Validación Zod en toda entrada del bot. Rate-limit por clave + IP en el endpoint de creación.
- **Legal (bloqueante para cobrar):** R4 (reembolso), privacidad/T&C publicadas, DPA firmado, EIPD presentada.
- **Observabilidad:** Sentry + uptime + alertas, tanto en software como en bot.
- RLS por rol cuando exista un 2º usuario (el path del bot no se ve afectado: usa service client).

---

## 13. Verificación (cómo se prueba de extremo a extremo)
- **Disponibilidad:** check de regresión puro (`src/lib/availability/__availability_check.mts`, vía `node_modules/.bin/jiti`, como `__pnl_check.mts`): fin de semana, tope 2/vuelo, límite `max_flights_per_day`, meteo=0, `classifyDate` mes actual vs futuro, día lleno → UNAVAILABLE.
- **Migración:** aplicar en una rama Supabase (nunca prod); confirmar que el software existente sigue funcionando (aditiva); regenerar tipos y diferenciar contra los escritos a mano.
- **Stripe test mode:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; pagar con `4242...` y la ruta Bizum; verificar: una fila `payments` (`stage='RESERVA'`), `payment_sessions='PAID'`, `deposit_paid`, lead `CONFIRMED`; reenviar el evento → sin duplicado.
- **API del bot:** sembrar una `api_keys`; `curl` cada endpoint (happy path; clave mala → 401; campo faltante → 422; bucle → 429; fecha llena → 409 con `suggestedDates`).
- **E2E:** bot `POST /reservations` (fecha de mes futuro) → TENTATIVE_ONLY + paymentUrl → pagar en test → TENTATIVE + depósito pagado → correr `promoteTentativeLeads` con "today" simulado en ese mes → CONFIRMED con vuelo real; y, aparte, meteo-cancelar un día confirmado → participantes `RESCHEDULE_NEEDED`, plazas liberadas.
- **Build/tsc limpios** por entregable (como en finanzas v2).

---

## 14. Decisiones humanas pendientes (🔵 — para Ricardo y/o el hermano)
1. **Capacidad real:** `max_flights_per_day` y nº de instructores/avión por día (confirmar con Raúl). El preliminar asumía 10 vuelos/día = 20 saltos; validar.
2. **Acceso cruzado** repos + Supabase (escritura mutua) y, a largo plazo, consolidar la infra bajo una cuenta de empresa (no personal).
3. **Política de reembolso/cancelación (R4)** y **publicación legal** (privacidad/T&C) — bloqueante para cobrar.
4. **Proveedor de pago:** confirmar Stripe (recomendado) vs Redsys; importe del depósito (60€) y si es reembolsable.
5. **Reparto de ejecución:** confirmar que el hermano hace R1–R4 (software) y Ricardo R5 (chatbot), coordinando el contrato de API.
6. **Onboarding/PDFs y mensajería:** reescribir el copy de onboarding (hoy asume fecha concreta) al modelo cola+tentativa.

---

## 15. Esfuerzo estimado y riesgos top

**Esfuerzo (orientativo, 1 desarrollador + disponibilidad de Raúl para validaciones):**
- R0 ~3-5 días · R1 ~1-1,5 sem · R2 ~3-5 días · R3 ~1 sem · R4 ~3-5 días → **software (R1-R4) ~3-4 semanas**.
- R5 (chatbot, lado Ricardo) ~3-4 semanas (rewire n8n + pago en chat + WhatsApp S21 + quitar Sheets). El análisis del chatbot estima 6-8 semanas para llevarlo a producción completa incluyendo lo legal.
- **Programa completo (software + chatbot + legal): ~8-10 semanas.** R1-R4 son aditivas y pueden ir avanzando sin esperar a R5.

**Riesgos top (mitigación):**
1. **Legal sin cerrar (R4 reembolso + privacidad)** bloquea el cobro → arrancar YA, en paralelo a R1.
2. **Recuperabilidad de n8n** (exports rotos, fuente de verdad solo en vivo) → riesgo de caída total del bot; arreglar exports + DR **antes** de tocar el workflow.
3. **Concurrencia en asignación de plaza** (sobreventa) → mitigada con la RPC `reservations_assign_seat` + `FOR UPDATE`.
4. **Fuga de service key** (footgun `NEXT_PUBLIC_`) → renombrar **antes** de activar API/webhook (R2/R3).
5. **Infra en cuentas personales** → consolidar a cuenta de empresa a medio plazo (no bloquea, pero es fragilidad de negocio).
6. **Política intra-mes mal entendida por el cliente** → el modelo tentativa+auto-promoción (§8) y el copy de onboarding reescrito lo resuelven; validar mensajes.

---

> **Siguiente paso operativo:** cuando se apruebe este plan, guardarlo como documento standalone (p. ej. `02_roadmap/RESERVAS_MASTER_PLAN_v2.md` en el proyecto, o un `.md` para enviar al hermano) y arrancar por la Fase R0. Este plan vive ahora en el archivo de plan de esta sesión; al salir de plan mode lo paso a un documento entregable.
