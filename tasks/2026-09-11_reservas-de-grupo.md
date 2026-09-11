# Reservas de grupo — rediseño desde la base

> Sesión 2026-09-11. Ricardo (CEO/CTO iJump) + Claude.
> Repos afectados: `ijump-software/` (3 PRs) y `chatbot/` (1 entrega coordinada).

---

## 1. Diagnóstico verificado

### 1.1 El agujero real: las reservas de grupo NO existen en el software

El sub-workflow n8n `iJump - Tool Crear Reserva` (`XjVUXGVlMgslo8UO`, v1) contiene
esta rama explícita (`04_workflows/n8n_ijump_tool_crear_reserva_v1.json`, nodo
"Validar y decidir"):

```js
// La API exige preferredDate (YYYY-MM-DD) y es 1 reserva = 1 persona
else if (nPeopleVal > 1)  apiSkipped = 'group';
```

Consecuencia: **cuando `n_personas > 1` no se llama a `POST /api/bot/v1/reservations`
en absoluto**. La reserva de grupo no crea ni un solo lead. Solo queda registrada en:
- Supabase `bot_reservations_inbox` (tabla del chatbot, ajena al software)
- Google Sheets "Reservas Mirror"
- Email a administración

No es que el grupo se registre mal: es que **una reserva de pareja o grupo es
invisible para el panel de reservas y para el manifest**. Solo la ve la
administrativa en el email/Sheet y la introduce a mano, si se acuerda.

### 1.2 Por qué la API solo acepta 1 persona

Está documentado como decisión consciente en
`src/app/api/bot/v1/reservations/route.ts:22-25`:

> *Batch/companion participants (the `participants?` array in the original
> contract) are deferred — out of scope for this pass.*

Y en `docs/reservas/RESERVATIONS_INTEGRATION.md:84` como limitación conocida.

### 1.3 El nudo arquitectónico: `reservation_groups` está secuestrada

La tabla `reservation_groups` existe desde el esquema inicial y está pensada
para agrupar. Pero `createParticipant` (`src/lib/actions/participant.ts:61-69`)
hace esto:

```ts
let resolvedGroupId = data.reservationGroupId ?? null
if (data.source) {
  // crea SIEMPRE un grupo nuevo, pisando el reservationGroupId recibido
  resolvedGroupId = group.id
}
```

Como `source` es obligatorio en el formulario de alta manual, **cada participante
genera su propio "grupo de 1"**. La tabla de grupos se ha convertido de facto en
un portador del campo `source`, no en un agrupador. Por eso:

- `groupSize` (`leads.ts:733`) es siempre 1 → el badge "Grupo" de
  `ReservationRow.tsx:96` no se muestra nunca en la práctica.
- Es un **bug además de un vacío**: pasar `reservationGroupId` *y* `source` a la
  vez crea silenciosamente un grupo nuevo y descarta el grupo pedido. Hoy nadie
  lo hace, pero es la primera piedra con la que tropezaría cualquier
  implementación de grupos.

Ya estaba detectado en `docs/reservas/CRM_REVIEW_2026-07.md:121-125` y pendiente
en `docs/reservas/CHECKLIST.md:92`.

### 1.4 El manifest parte los grupos

`reservations_assign_seat(p_lead_id, p_date)` asigna asiento **de uno en uno**.
Con `max_clients_per_flight = 2`, confirmar 4 personas una a una puede sentarlas
en los vuelos 1, 3 y 7 del día. Nada en el sistema sabe que van juntas ni avisa
de que se han separado. `FlightCard` / `ParticipantRow` solo muestran `payerName`
si existe, que hoy tampoco se rellena nunca desde el bot.

### 1.5 La capacidad física manda

`max_clients_per_flight = 2` (business_settings). Un grupo de 4 **no cabe**
en un vuelo: necesita 2 vuelos. Uno de 9 necesita 5. Por tanto "no partir el
grupo" no puede significar "mismo vuelo": significa **mismo día, vuelos
consecutivos, y cohesión visual en el manifest**. Esto coincide con la regla
operativa que ya está escrita en la KB del chatbot
(`02_kb/KB_ijumpskydive_v12.md:267-276`).

---

## 2. Decisiones tomadas (Ricardo, 2026-09-11)

| Decisión | Valor |
|---|---|
| Datos por acompañante | Nombre y apellidos + peso + paquete |
| Datos del organizador | Todos (teléfono, email, peso, paquete, edad...) |
| Tamaño de grupo normal | Hasta 9 personas |
| Grupos de 10+ | Se acepta la reserva, se marca como **EVENTO**, mensaje claro de que el equipo debe confirmarlo expresamente, y se escala al equipo |
| Descuentos de grupo | El bot no los concede. Dice que son posibles pero que hay que hablar con el equipo, y escala |
| Cobro | Preferente: el organizador paga todo. Alternativa: cada uno lo suyo. Ambas soportadas |
| Menores de edad | Sí, se marcan por participante |

---

## 3. Diseño

### 3.1 Modelo de datos

Se **recupera la semántica original** de `reservation_groups`: una fila = una
reserva (booking), con 1..N participantes. No hace falta migrar datos: los
"grupos de 1" existentes ya son, bajo esta semántica, reservas de una persona.

`reservation_groups` (columnas nuevas):
- `payment_mode TEXT` — `ORGANIZER` | `INDIVIDUAL` | `UNDECIDED` (default).
  **Informativo**, nunca una restricción: solo decide la acción de cobro por
  defecto y el aviso en el manifest. Cualquier mezcla sigue siendo posible.

`participants` (columnas nuevas):
- `is_organizer BOOLEAN NOT NULL DEFAULT FALSE` — quien hace la reserva y aporta
  el contacto. Índice único parcial: `UNIQUE (reservation_group_id) WHERE is_organizer`.
- `is_minor BOOLEAN NOT NULL DEFAULT FALSE` — menor de edad, falta autorización.

`business_settings` (clave nueva):
- `group_event_threshold = '10'` — a partir de aquí, EVENTO. No hardcodear.

`payments` (columna nueva):
- `group_payment_id UUID` — agrupa las N filas generadas por un cobro único del
  organizador, para poder mostrarlo y deshacerlo como una sola operación.

**Fix del bug:** en `createParticipant`, un `reservationGroupId` explícito gana
siempre; el grupo solo se crea cuando no viene ninguno.

**Por qué los acompañantes son filas `participants` completas** y no un JSON:
cada uno necesita su propio waiver (QR individual, `waiver.ts`), su propio
`participant_items` (facturación por persona), su propio asiento (`flight_id`),
su propio instructor y su propio recargo OW. Cualquier otra representación
obligaría a duplicar media aplicación. El acompañante es un participante que
simplemente no aporta teléfono ni email.

### 3.2 Asignación de asientos sin partir el grupo

RPC nueva `reservations_assign_group(p_group_id, p_date)`, **todo o nada**:

1. Bloquea los vuelos del día (`FOR UPDATE`, igual que la RPC actual).
2. Cuenta los N miembros sin asiento, en orden estable (organizador primero).
3. Construye la lista de vuelos del día ordenada por hora, con sus huecos libres,
   y añade los vuelos "virtuales" que aún se podrían crear (respetando
   `max_flights_per_day` y `flight_interval_minutes`).
4. Ventana deslizante: busca el **bloque contiguo de vuelos de menor amplitud**
   cuya suma de huecos sea >= N. Si el organizador pidió hora concreta, se
   prefiere el bloque que empieza en esa hora.
5. Si no existe ningún bloque suficiente → `NO_SEATS_AVAILABLE`. **Nadie se
   sienta**: no se parte el grupo entre días ni se deja a medias.
6. Materializa los vuelos virtuales necesarios y sienta a los N.

`confirmLead` se mantiene para reservas de 1. `confirmGroup` envuelve la RPC nueva
y replica lo que ya hace `confirmLead` para cada miembro: itemización automática
(`syncAutoParticipantItems`) y `last_contact_at`.

Cancelar y reagendar tienen variante de grupo, también todo o nada, reutilizando
el patrón de `rescheduleLeadsBatch`.

### 3.3 Cobro de grupo

El modelo de pagos **no se toca**: `payments.participant_id` sigue siendo por
persona, para que caja, AR, cierre de caja y P&L sigan cuadrando exactamente
igual. Lo que se añade es una operación por encima:

**Acción "Cobrar a todo el grupo"**: se introduce importe + método + etapa una
sola vez, y el sistema genera N filas de `payments`, una por miembro,
repartiendo el importe **en proporción al saldo pendiente de cada uno**
(total de sus `participant_items` menos lo ya cobrado). El resto de redondeo en
céntimos se asigna al organizador. Las N filas comparten `group_payment_id`,
así que se muestran como un único cobro y se pueden deshacer juntas.

**Resuelve el caso "cada uno paga lo suyo"** sin nada adicional: cada miembro ya
lleva su grupo en la ficha, así que cuando la administrativa cobra a la persona 3
ve en su fila "Grupo Pichardo · 3/4" y el **saldo del grupo completo**
("cobrado 600 € de 900 €, faltan 2 personas"). No hace falta que el cliente
recuerde de qué grupo viene: el sistema ya lo sabe.

Y cubre el caso real mixto (el organizador paga las señales de todos, cada uno
liquida lo suyo el día del salto) sin ninguna lógica extra, porque ambas
operaciones conviven.

`payment_mode` solo sirve para que la administrativa sepa qué se acordó y para
elegir la acción por defecto.

### 3.4 Grupos grandes = EVENTO

Un grupo con N >= `group_event_threshold` (10):
- Se acepta igual: se crean el grupo y sus N participantes como leads `NEW`.
- **Nunca se autoconfirma**, independientemente de `bot_autoconfirm_enabled`.
- Badge "EVENTO — requiere confirmación del equipo" arriba del todo en `/reservas`.
- Respuesta de la API con `requiresStaffConfirmation: true` y `isEvent: true`,
  para que el bot dé el mensaje correcto en lugar de prometer plaza.
- Escalado: notificación al equipo por el workflow de alertas del chatbot.

Lo mismo para cualquier petición de descuento de grupo: el bot no concede nada,
responde que es posible pero que lo tiene que hablar con el equipo, y escala.

### 3.5 UI

**Panel `/reservas`** — la fila pasa a ser una fila de *reserva*, no de persona:
- "Ricardo Pichardo **+3**" con chip de grupo y contador.
- Desplegable con los acompañantes (nombre, peso, paquete, marca de menor).
- Confirmar / cancelar / reagendar actúan sobre **todo el grupo** por defecto,
  con opción explícita de actuar sobre un solo miembro.
- Los acompañantes no generan filas sueltas en la lista (se colapsan en la del
  organizador), pero siguen siendo leads completos por debajo.

**Alta manual** (`AddParticipantDrawer`): botón "Añadir acompañante" que añade
filas compactas (nombre, peso, paquete, menor) en el mismo formulario.

**Manifest** — cohesión visual:
- Chip de grupo del mismo color en cada fila del grupo, con posición ("2/4").
- Aviso visible si un grupo ha quedado repartido en vuelos **no consecutivos**.
- Aviso si algún miembro es menor y falta la autorización.
- Contador de grupos del día en el resumen.

### 3.6 API del bot v1.2 (retrocompatible)

```jsonc
POST /api/bot/v1/reservations
{
  "fullName": "...", "phone": "...", "email": "...",
  "weight": 78, "packageType": "HANDYCAM",
  "preferredDate": "2026-10-04", "source": "DIRECT",
  "isMinor": false,
  "companions": [                                  // NUEVO, opcional
    { "fullName": "...", "weight": 65, "packageType": "SOLO", "isMinor": false }
  ],
  "paymentMode": "ORGANIZER"                       // NUEVO, opcional
}
```

Respuesta añade `groupId`, `partySize`, `isEvent` y `participants[]`
(id + token + nombre de cada miembro).

`GET /api/bot/v1/availability?partySize=4` → solo devuelve días con
`freeSeats >= partySize`. Sin `partySize`, comportamiento idéntico al actual.

Sin `companions`, **todo se comporta exactamente como hoy**: no hay día de corte,
el chatbot puede migrar cuando quiera.

Idempotencia por teléfono: se mantiene. Si el organizador ya tiene un lead
activo, se devuelve `duplicate: true` con `partySize` para que el bot pueda
decir "ya tienes una reserva para N personas".

### 3.7 Chatbot

- **Widget**: `n_personas` deja de ser un contador suelto. Al indicar N > 1 se
  despliegan N-1 bloques compactos (nombre, peso, paquete, menor).
- **Tool `crear_reserva`**: acepta `acompanantes[]` y `payment_mode`.
- **Sub-workflow `Tool Crear Reserva` v2**: se elimina la rama
  `apiSkipped = 'group'` y se envía `companions[]`. Se mantiene `apiEnabled`
  como kill switch.
- **Prompt v29 / v30_wa**: recoger nombres uno a uno sin interrogatorio, regla
  de eventos 10+, regla de descuentos con escalado.
- **KB v13**: regla de eventos y descuentos actualizada (hoy está marcada
  `[PENDIENTE]`), regla de vuelos consecutivos ya existente.
- **Escalado**: notificación al equipo para eventos y peticiones de descuento.

---

## 4. Entrega y coordinación

| # | Repo | Contenido | Depende de |
|---|---|---|---|
| PR 1 | ijump-software | Migración + fix del bug + acciones de grupo + RPC `reservations_assign_group` + tipos. Sin cambios visibles de UI | — |
| PR 2 | ijump-software | API del bot v1.2 (`companions`, `partySize`, eventos) + `BOT_API_CONTRACT.md` v1.2 | PR 1 |
| PR 3 | ijump-software | UI: panel de reservas, alta manual, manifest, cobro de grupo, menores | PR 1 |
| Entrega A | chatbot | Widget + tool + sub-workflow v2 + prompt + KB + escalado | PR 1 y PR 2 desplegados |

**Orden obligatorio:** PR 1 → PR 2 → desplegar → Entrega A. PR 3 puede ir en
paralelo a la Entrega A. Como la API es retrocompatible, no hay ventana de corte:
el chatbot sigue funcionando igual hasta que se active su versión nueva.

---

## 5. Tareas

### PR 1 — Núcleo de grupos
- [x] Migración: `is_organizer`, `is_minor`, `payment_mode`, `group_payment_id`, `group_event_threshold`, índice único parcial, bloque de ROLLBACK comentado
- [x] Fix `createParticipant`: `reservationGroupId` explícito gana sobre `source`
- [x] RPC `reservations_assign_group` (todo o nada, bloque contiguo mínimo)
- [x] `createGroupLead` / `confirmGroup` / `cancelGroup` / `rescheduleGroup`
- [x] `addCompanion` / `removeCompanion` / `promoteToOrganizer`
- [x] `listLeads`: colapsar acompañantes en la fila del organizador
- [x] Tipos en `domain.ts` (`companions`, `isOrganizer`, `isMinor`, `isEvent`, `paymentMode`)
- [x] `graphify update .`

### PR 2 — API del bot v1.2
- [x] `POST /reservations`: `companions[]`, `isMinor`, `paymentMode`, límite y validación
- [x] Regla de evento (>= umbral): nunca autoconfirmar, `isEvent: true`
- [x] `GET /availability?partySize=N`
- [x] Dedupe por teléfono con `partySize` en la respuesta
- [x] `BOT_API_CONTRACT.md` → v1.2 con ejemplos
- [x] `RESERVATIONS_INTEGRATION.md`: quitar la limitación de la línea 84

### PR 3 — UI
- [x] `ReservationRow`: fila de reserva con chip de grupo y desplegable
- [x] `LeadSheet`: bloque de grupo (miembros, añadir/quitar, menores, saldo del grupo)
- [x] `AddParticipantDrawer`: "Añadir acompañante"
- [x] `ConfirmReservationModal` / cancelar / reagendar: alcance grupo vs individual
- [x] Manifest: chip de grupo con posición, aviso de grupo partido, aviso de menor
- [x] Cobro de grupo con reparto proporcional + saldo del grupo
- [x] Badge EVENTO en `/reservas`

### Entrega A — Chatbot
- [x] Widget: bloques de acompañante
- [x] Tool `crear_reserva`: `acompanantes[]`
- [x] Sub-workflow v2: quitar `apiSkipped = 'group'`, enviar `companions[]`
- [x] Prompt v29 / v30_wa: recogida de nombres, eventos 10+, descuentos
- [x] KB v13
- [x] Escalado de eventos y descuentos
- [x] `STATUS.md`

---

## 6. Hallazgos colaterales (fuera de alcance, para decidir)

1. **Doble fuente de verdad.** Las reservas del bot siguen yendo también a
   Google Sheets + `bot_reservations_inbox` + email. Cuando los grupos entren por
   la API, cada reserva existirá en los dos sitios y la administrativa podría
   apuntarla dos veces. Hay que planificar la retirada del Sheet, o al menos
   marcar en él las filas que ya llegaron al software.
2. **Capacidad hardcodeada.** `computeManifestSummary` (`src/lib/manifest-summary.ts:39`)
   usa `activeFlights.length * 2` en vez de leer `max_clients_per_flight`.
   Si algún día cambia el avión, el resumen del manifest miente.
3. **`updateLeadSource` sobre grupo compartido.** Cambiar la fuente de venta de
   un miembro la cambia para todo el grupo (vive en `reservation_groups`). Es
   correcto para una reserva, pero la UI debe decirlo.
4. **`03_prompts/tools_schema_v1.json` está obsoleto** (describe la arquitectura
   antigua de Google Sheets). Archivar para que nadie lo lea como fuente de verdad.
5. **`bot_autoconfirm_enabled` sigue apagado.** Correcto, y con grupos aún más:
   autoconfirmar un grupo de 6 a ciegas es mucho más caro que fallar con uno.

---

## 7. Review de cierre (2026-09-11)

### Entregado

| # | Dónde | PR | Estado |
|---|---|---|---|
| 1 | ijump-software | [#73](https://github.com/alepm03/ijump-software/pull/73) | Núcleo: modelo, RPC de grupo, colapso de `/reservas` |
| 2 | ijump-software | [#74](https://github.com/alepm03/ijump-software/pull/74) | API del bot v1.2 + contrato |
| 3 | ijump-software | [#75](https://github.com/alepm03/ijump-software/pull/75) | UI: panel, manifest, cobro de grupo, menores |
| A | ijump-agente-ia | [#15](https://github.com/ricardopm01/ijump-agente-ia/pull/15) | Widget, workflow v2, prompts v30/v31_wa, KB v13 |

Apilados: 73 → 74 → 75. El del chatbot no se activa hasta que 73 y 74 estén desplegados
(`chatbot/06_backend/RUNBOOK_activacion_grupos.md`).

### Lo que cambió respecto al plan

- **El diagnóstico resultó peor de lo previsto.** No era que el grupo se registrara mal: es que
  el chatbot **saltaba la llamada a la API entera** cuando había más de una persona, así que ni
  el lead del organizador llegaba. Eso no estaba en el plan inicial, se encontró al mapear el
  chatbot.
- **Regresión de producción encontrada de paso:** `20260715`/`20260716` habían perdido el
  `flight_interval_minutes` configurable que introdujo `20260704`. Los vuelos autocreados salían
  cada 60 minutos en vez de cada 45. Arreglado en la misma migración de la RPC de grupo.
- **El Google Sheet se mantiene** (decisión de Ricardo): ese canal ya no se usa en la práctica y
  se retirará más adelante, así que el hallazgo 1 queda como pendiente consciente, no como deuda.
- **Verificación por encima de lo planeado:** la RPC de grupo se probó contra un Postgres real en
  proceso (PGlite, sin Docker ni red) aplicando las migraciones de verdad, porque el Supabase de
  la app está en la organización de Alejandro y no es alcanzable desde aquí.

### Verificación

Nueve checks de regresión en verde, tres de ellos nuevos:

| Check | Qué protege |
|---|---|
| `supabase/__assign_group_check.mts` | 22 aserciones sobre la RPC de grupo contra Postgres real |
| `src/lib/finance/__group_payment_check.mts` | El reparto de un cobro suma siempre exactamente lo cobrado |
| `src/lib/__manifest_groups_check.mts` | Cohesión en el manifest y regla de grupo partido |
| `chatbot/08_testing/test_tool_crear_reserva_v4_grupos.mjs` | 29 aserciones; falla si vuelve la rama `apiSkipped = 'group'` |

Lint del software: **un error menos que `main`** y cero hallazgos nuevos (comparado archivo a
archivo, no por número).

### Lo que NO se verificó

**La UI no se ha probado en un navegador.** El único entorno disponible apunta a la base de datos
de producción y no se crearon reservas de prueba ahí. Merece una pasada visual en una rama de
Supabase tras aplicar las migraciones, sobre todo los chips del manifest a anchura de tablet
(~820px), que es donde se usa en el aeródromo.

### Hallazgos colaterales — estado

1. **Doble fuente de verdad (Sheet + software)** — se mantiene a propósito. Pendiente de retirar.
2. **Capacidad hardcodeada en `computeManifestSummary`** — arreglado (PR 3).
3. **`updateLeadSource` sobre grupo compartido** — la UI ya lo avisa (PR 3).
4. **`tools_schema_v1.json` obsoleto** — archivado (PR del chatbot).
5. **`bot_autoconfirm_enabled` sigue apagado** — correcto, sin cambios.

Nuevos, encontrados durante la ejecución:

6. **Regresión de la cadencia de vuelos** — arreglada (PR 1).
7. **`createLead` y `classifyDateLive` habían quedado sin llamadas** — eliminados (PRs 2 y 3).
8. **`PACKAGE_LABELS` duplicado en cuatro componentes con tres redacciones** — unificado (PR 3).
9. **`Date.now()` durante el render en `ReservationRow`** — arreglado (PR 3).
10. **7 errores de eslint preexistentes en `main`** (setState en effects, refs en render) — fuera
    de alcance, no tocados. Merecen una tarea propia.
