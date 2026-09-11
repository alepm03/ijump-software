# Reservas de grupo

> Guía del módulo. Estado: PR 1 (núcleo) y PR 2 (API del bot) listos. PR 3 (UI) va encima.
> Decisiones de negocio: Ricardo, 2026-09-11.

---

## El problema que resuelve

Muchas reservas de iJump son de pareja o de grupo. Hasta ahora el sistema no las
registraba: no las registraba **mal**, es que no las registraba en absoluto.

El sub-workflow n8n `iJump - Tool Crear Reserva` (`XjVUXGVlMgslo8UO`, v1) tiene
esta rama, con su propio comentario:

```js
// La API exige preferredDate (YYYY-MM-DD) y es 1 reserva = 1 persona
else if (nPeopleVal > 1)  apiSkipped = 'group';
```

Cuando el cliente indicaba más de una persona, **la llamada a
`POST /api/bot/v1/reservations` se saltaba entera**. Ni siquiera se creaba el lead
del organizador. Esa reserva solo quedaba en el Google Sheet, en el email a
administración y en la tabla `bot_reservations_inbox` del chatbot. Por eso no
aparecía en `/reservas` ni en el manifest.

El chatbot se comportaba así porque la API lo documentaba como límite
deliberado (`src/app/api/bot/v1/reservations/route.ts`: *"Batch/companion
participants are deferred"*) y `docs/reservas/RESERVATIONS_INTEGRATION.md` lo
recogía como limitación conocida.

### El nudo de fondo

`reservation_groups` existe desde el esquema inicial y está pensada para agrupar,
pero `createParticipant` creaba un grupo nuevo por **cada** participante porque
`source` (obligatorio en el formulario de alta) disparaba la creación. La tabla
de grupos acabó siendo un portador del campo "fuente de venta", no un agrupador.
Consecuencias:

- `groupSize` valía siempre 1, así que el badge "Grupo" de `ReservationRow` no
  aparecía nunca (ya detectado en `CRM_REVIEW_2026-07.md` §"Badge Grupo").
- Era además un bug latente: pasar `reservationGroupId` **y** `source` a la vez
  creaba un grupo nuevo y descartaba el pedido, en silencio.

Y `reservations_assign_seat` asigna asiento de uno en uno: confirmar a 4
personas seguidas podía dejarlas en los vuelos 1, 3 y 7 del mismo día, sin que
nada avisara.

---

## Modelo

Una fila de `reservation_groups` es **una reserva** con 1..N participantes. No
hizo falta migrar datos: los grupos-de-1 existentes ya son, bajo esta semántica,
reservas de una persona correctas.

| Columna nueva | Tabla | Para qué |
|---|---|---|
| `is_organizer` | `participants` | Quien reserva y aporta el contacto. Único por grupo (índice único parcial) |
| `is_minor` | `participants` | Menor de edad: falta la autorización paterna firmada |
| `payment_mode` | `reservation_groups` | `ORGANIZER` / `INDIVIDUAL` / `UNDECIDED`. **Informativo**, no restringe ningún cobro |
| `group_payment_id` | `payments` | Agrupa las N filas de un cobro único repartido |
| `group_event_threshold` | `business_settings` | Tamaño a partir del cual la reserva es un EVENTO (10) |

### Por qué los acompañantes son filas `participants` completas

Porque cada persona necesita lo suyo: su waiver (QR individual), sus
`participant_items` (facturación por persona), su asiento, su instructor y su
recargo de sobrepeso. Cualquier otra representación (un JSON de nombres, un
contador) obligaría a duplicar media aplicación. Un acompañante es simplemente
un participante que no aporta teléfono ni email: esos viven en el organizador.

### Datos que se piden

| | Organizador | Acompañante |
|---|---|---|
| Nombre y apellidos | ✅ | ✅ |
| Peso | ✅ | ✅ |
| Paquete | ✅ | ✅ (hereda el del organizador si no elige) |
| Menor de edad | ✅ | ✅ |
| Teléfono / email | ✅ | ❌ |
| DNI, fecha de nacimiento, contacto de emergencia | en el waiver, el día del salto | igual |

El **peso** no es opcional en la práctica: fija el límite del tándem, el recargo
de sobrepeso y la asignación de equipo e instructor. Sin él, el recargo es una
sorpresa en el aeródromo y el manifest sale incompleto.

---

## No partir el grupo

La capacidad es de **2 clientes por vuelo** (`max_clients_per_flight`). Un grupo
de 4 no cabe en un vuelo: necesita 2. Uno de 9 necesita 5. Así que "no partir el
grupo" solo puede significar **mismo día, vuelos consecutivos y cohesión visual
en el manifest**. Es la misma regla que ya estaba escrita en la KB del chatbot.

De eso se encarga `reservations_assign_group(p_group_id, p_date)`:

1. Lista los miembros sin asiento, **organizador primero** (si el grupo acaba
   repartido, el organizador queda en el primer vuelo).
2. Construye los huecos del día ordenados por hora: los vuelos existentes con
   sus plazas libres, más los vuelos que todavía se podrían crear (respetando
   `max_flights_per_day` y `flight_interval_minutes`).
3. **Ventana deslizante**: busca el bloque contiguo de **menor amplitud** cuya
   suma de huecos alcance para todo el grupo. Si el organizador pidió hora
   concreta, gana el bloque que empieza a esa hora aunque sea más ancho.
4. Si no hay ningún bloque suficiente → `NO_SEATS_AVAILABLE` y **no se sienta a
   nadie**. Nunca media reserva confirmada, nunca un grupo repartido entre días.
5. Materializa los vuelos que hagan falta y sienta a los N.

Una ventana puede incluir un vuelo lleno de por medio: cuenta para la amplitud
pero no aporta plazas. Como se minimiza la amplitud, los bloques limpios ganan
siempre; si la única opción viable tiene un vuelo ajeno intercalado, se sienta
igual y la UI marcará el grupo como repartido (PR 3). Negar una reserva que sí
cabe en el día sería peor.

### Verificación

```bash
node_modules/.bin/jiti supabase/__assign_group_check.mts
```

Levanta un Postgres real en proceso (PGlite, WASM — sin Docker ni red) sobre un
subconjunto fiel del esquema, aplica las migraciones de verdad y cubre: pareja
en un vuelo, grupo de 4 a 45 minutos, contigüidad frente a hueco suelto, hora
pedida, día lleno (todo o nada), grupo de 9, miembros ya sentados o cancelados,
reejecución e índice de organizador único.

---

## Cobro

**El modelo de pagos no cambia**: siguen siendo por participante, que es lo que
mantiene cuadrando caja, AR, cierre de caja y P&L. Lo que se añade va por encima
(PR 3):

- **"Cobrar a todo el grupo"**: un importe único que se reparte entre los
  miembros **en proporción a su saldo pendiente** (sus `participant_items` menos
  lo ya cobrado). El resto de redondeo en céntimos va al organizador. Las N
  filas comparten `group_payment_id`, así que se ven y se deshacen como una sola
  operación.
- **"Cada uno paga lo suyo"** no necesita nada nuevo: cada miembro ya lleva su
  grupo en la ficha. Cuando la administrativa cobra a la persona 3, su fila dice
  "Grupo Pichardo · 3/4" y muestra el saldo del grupo completo. El cliente no
  tiene que recordar de qué grupo viene: el sistema ya lo sabe.
- El caso real **mixto** (el organizador paga las señales de todos y cada uno
  liquida lo suyo el día del salto) funciona solo, porque las dos operaciones
  conviven.

`payment_mode` solo registra lo acordado y elige la acción por defecto.

---

## Eventos (10 o más)

A partir de `group_event_threshold` (10) la reserva es un **evento**:

- Se acepta igual: se crean el grupo y sus N participantes como leads `NEW`.
- **Nunca se autoconfirma**, aunque `bot_autoconfirm_enabled` esté activo.
- La UI lo marca como "EVENTO — requiere confirmación del equipo" (PR 3).
- La API responde `isEvent: true` + `requiresStaffConfirmation: true` para que
  el bot no prometa plaza, y el equipo recibe un aviso (PR 2 + chatbot).

Descuentos de grupo: el bot no concede ninguno. Responde que son posibles pero
que hay que hablarlo con el equipo, y escala.

---

## Mapa de código

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20260911000000_reservation_groups.sql` | Columnas, índice de organizador único, umbral de evento |
| `supabase/migrations/20260911000001_reservations_assign_group.sql` | RPC de grupo + arreglo de la cadencia en `reservations_assign_seat` |
| `supabase/__assign_group_check.mts` | Comprobación de la RPC sobre Postgres real |
| `src/lib/actions/group.ts` | `createGroupLead`, `confirmGroup`, `cancelGroup`, `rescheduleGroup`, `addCompanion`, `removeCompanion`, `promoteToOrganizer`, `setGroupPaymentMode` |
| `src/lib/actions/participant.ts` | Arreglo: un `reservationGroupId` explícito gana sobre `source` |
| `src/lib/actions/leads.ts` | `listLeads` colapsa cada reserva en la fila de su organizador |
| `src/lib/actions/settings.ts` | `getGroupEventThreshold` |
| `src/app/api/bot/v1/reservations/route.ts` | Contrato v1.2: `companions[]`, `partySize`, regla de evento |
| `src/app/api/bot/v1/availability/route.ts` | `?partySize=N` — solo días donde cabe el grupo entero |
| `docs/reservas/BOT_API_CONTRACT.md` | Contrato v1.2, la fuente de verdad compartida con el chatbot |

---

## Regresión arreglada de paso

`20260704` hizo configurable la cadencia de vuelos
(`flight_interval_minutes = 45`), pero `20260715` y `20260716` reconstruyeron
`reservations_assign_seat` a partir de un cuerpo anterior al cambio y volvieron
a fijar `INTERVAL '1 hour'`. En producción los vuelos autocreados salían cada 60
minutos en lugar de cada 45. `20260911000001` restaura la lectura del ajuste; el
resto del cuerpo es literalmente el de `20260716`, sin ningún otro cambio.
Los casos B y F del check fallan si la cadencia no se respeta.

---

## API del bot (v1.2)

`POST /api/bot/v1/reservations` acepta `companions[]` (nombre, peso, paquete,
menor) más `isMinor` y `paymentMode` del organizador. La respuesta añade
`groupId`, `partySize`, `isEvent` y `participants[]` con un `statusUrl` por
persona.

`GET /api/bot/v1/availability?partySize=N` filtra los días donde no cabe el
grupo entero, y las `suggestedDates` de un 409 vienen filtradas igual: ofrecer
a una pareja un día con una sola plaza devuelve al cliente al principio.

Un 409 distingue ahora "el día está cerrado" de "ese día no caben los N", que
es información distinta para el cliente.

**Retrocompatible**: sin `companions`, el endpoint se comporta exactamente
igual que en v1.1. No hay fecha de corte; el chatbot migra cuando quiera.

El contrato completo, con ejemplos, está en `BOT_API_CONTRACT.md`.

## Pendiente

- **PR 3** — UI: fila de reserva con acompañantes desplegables, alta manual con
  acompañantes, cohesión de grupo en el manifest, cobro de grupo, aviso de menor.
- **Chatbot** — widget con bloques de acompañante, `Tool Crear Reserva` v2 sin
  la rama `apiSkipped = 'group'`, prompt y KB, escalado de eventos y descuentos.
- **Doble fuente de verdad**: las reservas del bot seguirán yendo también al
  Google Sheet y al email. Se mantiene a propósito (Ricardo, 2026-09-11): ese
  canal ya no se usa en la práctica y se retirará más adelante.
