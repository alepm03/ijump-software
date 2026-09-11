# NEXT SESSION — Backlog CRM de reservas: reactivación NO_SHOW/CANCELLED + canal STAFF_PHONE/STAFF_WHATSAPP

> Copia y pega el bloque de abajo (desde "Actúas como…") en una sesión nueva de Claude Code, abierta en `~/Documents/IA/Clientes/Ijumpskydive/ijump-software/`.

---

## Configuración de la sesión

- **Modelo:** **Sonnet 5**. No hace falta Opus/Fable: es implementación de features bien acotadas sobre un codebase con convenciones ya establecidas, no una decisión de arquitectura nueva ni un diagnóstico abierto. Prioriza eficiencia de tokens sobre todo.
- **Modo:** **Plan mode breve** al arrancar (hay 2-3 decisiones pequeñas de diseño, ver abajo), pero **no exhaustivo** — este documento ya trae los archivos, líneas y funciones exactas. No relances una exploración amplia de lo que ya está aquí verificado.
- **Esfuerzo:** medio. No es un problema abierto, es ejecutar un backlog conocido.
- **Subagentes:** no uses `Explore` ni fan-out de agentes para esta sesión — el contexto ya está cargado abajo y el alcance es pequeño (2-3 archivos por entregable). Referencia de la propia `CLAUDE.md` del repo: "NO usar [subagentes] para tareas de menos de 15 minutos o cuando ya tienes el contexto claro."

---

## PROMPT (copiar desde aquí)

Actúas como mi co-CEO/co-CTO en iJump Skydive, en el proyecto del SOFTWARE:
`~/Documents/IA/Clientes/Ijumpskydive/ijump-software/` (lee `CLAUDE.md` — ya conoces las convenciones de ramas/PR/migraciones de este repo). Trabaja en una rama nueva (`feature/crm-reactivacion-no-show`), **nunca en `main`**; al final abre PR — el merge lo hace Alejandro, no tú.

### Objetivo (2 entregables del backlog `docs/reservas/CRM_REVIEW_2026-07.md`, roadmap ítems 3 y 4)

1. **Reactivación de leads NO_SHOW/CANCELLED** (P1, roadmap ítem 4).
2. **Canal `STAFF_PHONE` / `STAFF_WHATSAPP`** (P1, roadmap ítem 3).
3. Si sobra tiempo tras cerrar 1 y 2: **H9 del security audit** (`AUDITORIA.md`), límites de longitud en el schema Zod de la API del bot — es rápido y está relacionado con reservas (la propia API de reservas del bot).

**Fuera de alcance de esta sesión** (no los toques): el resto de hallazgos del security audit (H10 en adelante — son de Alejandro, no relacionados con reservas específicamente), ítems P2 del roadmap CRM (métricas de embudo, waitlist, entidad `customer`).

### 1. Reactivación NO_SHOW/CANCELLED

**Texto exacto del hallazgo** (`docs/reservas/CRM_REVIEW_2026-07.md`, sección "P1 — NO_SHOW y CANCELLED son agujeros negros"):
> Son estados terminales. Un no-show con bono de plataforma ya pagado es dinero de iJump sin coste — recuperarlo es margen puro. Nadie los re-contacta. Propuesta: en el tab Canceladas, botón "Reactivar" (→ NEW con nota automática) y contador de no-shows recuperables del mes. Esfuerzo: bajo.

**Ya verificado (no re-explorar):**
- `NO_SHOW` y `CANCELLED` ya existen como valores de `OperationalStatus` en `src/types/domain.ts` (líneas ~60-61, ~483-484). No hace falta tocar el enum.
- `src/lib/actions/participant.ts` ya tiene `updateOperationalStatus(id, status)` (línea ~270) y `updateParticipant` (línea ~138), que ya gestionan la lógica de auto-itemización al cambiar de estado (`NON_FLYING_STATUSES`, línea ~12) — sigue ese mismo patrón para la nueva acción, no dupliques la lógica de itemización.
- Componentes que ya muestran/filtran `CANCELLED`: `src/components/operational/DayManifest.tsx`, `FlightCard.tsx`, `DayCard.tsx`, `DayHeader.tsx`, `CancelFlightDialog.tsx`. **Decisión a tomar en plan mode:** el roadmap habla de un "tab Canceladas" — confirma si existe ya una vista así en `/reservas` (la lista CRM de leads, Sprint 3) o si "reactivar" debe vivir en la vista operacional del día (donde SÍ están estos componentes). Dado que un no-show/cancelado es un participante ya asociado a un vuelo pasado, probablemente la acción vive en la vista operacional del día concreto, no en `/reservas`. Decide con lo que encuentres, no asumas.
- **Qué significa "reactivar" técnicamente:** el participante deja de estar atado a un vuelo (es lead otra vez). Repasa cómo se distingue hoy un lead de un participante volado (`flight_id IS NULL` = lead, por diseño ya documentado en `RESERVATIONS_INTEGRATION.md`) antes de decidir qué campos tocar (`flight_id`, `lead_status`, si conservar o resetear `operational_status` como histórico).

**Entregable:**
- Server action `reactivateParticipant(id, note?)` en `participant.ts` (o donde encaje mejor): pone `flight_id = NULL`, `lead_status = 'NEW'`, añade la nota automática (algo tipo "Reactivado desde {estado anterior} el {fecha}" + nota manual opcional), y aparece de nuevo en la cola de leads (aging del CRM P0, ya construido — no lo toques, solo asegúrate de que el lead reactivado entra en esa cola con normalidad).
- Botón "Reactivar" en la UI donde decidas que corresponde (ver arriba).
- Contador de "no-shows recuperables del mes" (cuenta simple de participantes en `NO_SHOW` con `flight_id` de vuelos del mes en curso, no reactivados aún) — un componente pequeño, no un dashboard nuevo.
- Migración: **ninguna necesaria** si no tocas el schema (solo lógica + UI). Si detectas que hace falta una columna (p. ej. para registrar cuándo/quién reactivó), sigue la convención de migraciones aditivas y reversibles del repo (`ADD COLUMN ... DEFAULT`, bloque `ROLLBACK` al final).

### 2. Canal `STAFF_PHONE` / `STAFF_WHATSAPP`

**Texto exacto del hallazgo** (misma doc, sección "P1 — Canal de contacto ≠ fuente de venta"):
> `channel` (WEB_BOT | WHATSAPP_BOT | STAFF) mezcla poco y `reservation_source` (DIRECT/GROUPON/...) es la plataforma de venta. Falta el matiz "STAFF por teléfono" vs "STAFF por WhatsApp". Propuesta: ampliar `channel` con `STAFF_PHONE` / `STAFF_WHATSAPP`, seleccionable en el alta con default sensato (STAFF como hoy). Esfuerzo: bajo. Nota: es un enum → misma excepción de reversibilidad que `reservation_source` (issue #43); agrupar con la próxima migración de enums.

**Ya verificado (no re-explorar):**
- El enum vive en `supabase/migrations/20260622000000_reservations.sql` (líneas ~19-45): `CHECK (channel IN ('WEB_BOT', 'WHATSAPP_BOT', 'STAFF'))` en `participants` y `reservation_groups`.
- La API del bot (`src/app/api/bot/v1/reservations/route.ts:96`) ya fija `channel: 'WEB_BOT'` correctamente — **esa parte NO tiene gap**, no la toques.
- `src/lib/actions/leads.ts:60` fija `channel: input.channel ?? 'STAFF'` al crear un lead manual — aquí es donde entra el selector nuevo.
- **Precedente directo a seguir** (mismo patrón, mismo tipo de cambio): issue de GitHub **#43** (`gh issue view 43 --repo alepm03/ijump-software`), sobre extender `reservation_source`. Ahí está documentado que `ALTER TYPE ... ADD VALUE` **no es reversible** (excepción explícita a la regla de migraciones del repo) y que en Postgres de Supabase puede ejecutarse fuera de una transacción envolvente. Sigue exactamente ese mismo patrón de migración para `channel`.

**Entregable:**
- Migración: `ALTER TYPE channel ADD VALUE 'STAFF_PHONE';` y `'STAFF_WHATSAPP'` (revisa el nombre real del tipo Postgres — puede ser un `CHECK` en vez de un `ENUM` nativo, ajusta según lo que encuentres; si es `CHECK`, es una migración normal reversible, sin la excepción de arriba — confírmalo antes de aplicar nada, cambia bastante el enfoque).
- Selector en el formulario de alta manual de leads (donde esté `leads.ts` conectado a UI) con default `STAFF` si no se especifica (cero fricción para el staff que no quiera el detalle).
- Actualiza `docs/reservas/CRM_REVIEW_2026-07.md` marcando el ítem 3 como ejecutado (mismo patrón que el ítem 1/2 ya marcados ✅ arriba en ese documento).

### 3. (Si sobra tiempo) H9 — límites de longitud en la API del bot

`src/app/api/bot/v1/reservations/route.ts` — el schema Zod no limita `fullName`/`phone`/`email`. Añade `.max()` razonables (`fullName` 120, `phone` 30) y `.trim()`. Sin migración. Marca H9 como resuelto en `AUDITORIA.md` (mismo formato que H1-H3).

### Guardrails

- Migraciones: aditivas y reversibles salvo el caso `ADD VALUE` de enum ya documentado (y solo si confirmas que es de verdad un enum Postgres, no un `CHECK`). Bloque `ROLLBACK` al final de cada migración nueva.
- `npx tsc --noEmit` limpio antes de dar nada por cerrado.
- Rama `feature/crm-reactivacion-no-show`, commits en inglés/imperativo, PR al final con `gh pr create` — **no mergees a `main`**.
- Actualiza `docs/reservas/CRM_REVIEW_2026-07.md` (marcar ítems 3 y 4 del roadmap ✅) y `CLAUDE.md` §Estado actual si corresponde.
- No toques nada del chatbot (`../chatbot/`) ni de la API del bot más allá de lo descrito en el punto 3.

## PROMPT (fin)
