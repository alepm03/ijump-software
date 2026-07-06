# Contrato de la API del bot — iJump Reservas

> Para Ricardo (rewire del chatbot, R5). Esta API permite que el bot consulte disponibilidad y cree/consulte reservas sin tocar la base de datos directamente.

**Historial de versiones:**
- **v1.1 (2026-07-04)** — CRM P0: normalización canónica de `phone` e idempotencia por teléfono en `POST /reservations` (respuesta `200` + `duplicate: true`).
- v1.0 (2026-06-24) — contrato inicial (PR #37).

## Base URL y autenticación

```
https://<dominio-de-producción>/api/bot/v1/...
```

Cada request debe incluir:

```
X-API-Key: ijk_live_<random>
```

La clave la genera el hermano (alepm03) directamente en Supabase y te la pasa fuera de banda (no se transmite por chat/email). Si la clave falta, es inválida, está revocada, o no tiene el *scope* necesario para el endpoint, la respuesta es `401` o `403` (ver abajo).

Cada clave tiene:
- **scopes**: combinación de `reservations:write`, `availability:read`, `status:read`. Si tu clave no tiene el scope del endpoint que llamas, te devuelve `403`.
- **rate_limit_per_min**: límite de peticiones por minuto (ventana fija de 60s). Al superarlo, `429` con header `Retry-After` (segundos hasta que se resetea la ventana).

## Formato de error (todos los endpoints)

```json
{ "error": { "code": "string", "message": "string" } }
```

Códigos posibles: `unauthorized` (401), `forbidden` (403), `validation_error` (422), `rate_limited` (429), `not_found` (404), `unavailable` (409), `internal_error` (500).

---

## `GET /api/bot/v1/availability`

Scope requerido: `availability:read`

Devuelve los próximos días reservables (fines de semana operativos, dentro de la ventana de 30 días donde se puede confirmar al instante — ver nota sobre `TENTATIVE_ONLY` más abajo).

**Query params:**
- `from` (opcional, `YYYY-MM-DD`) — desde qué fecha buscar. Por defecto, hoy.
- `limit` (opcional, 1-30) — cuántos días devolver. Por defecto, 6.

**200:**
```json
{
  "slots": [
    { "date": "2026-07-04", "freeSeats": 20, "classification": "CONFIRMABLE" },
    { "date": "2026-07-05", "freeSeats": 20, "classification": "CONFIRMABLE" }
  ]
}
```

`classification` es siempre `CONFIRMABLE` o `TENTATIVE_ONLY` en este endpoint (solo lista días reservables; días llenos/cerrados/no operativos no aparecen).

---

## `GET /api/bot/v1/availability/day`

Scope requerido: `availability:read`

Desglose completo de un día concreto.

**Query params:**
- `date` (requerido, `YYYY-MM-DD`)

**200:**
```json
{
  "date": "2026-07-04",
  "isOperatingDay": true,
  "weatherCancelled": false,
  "existingFlights": 0,
  "freeSeatsInExistingFlights": 0,
  "potentialNewFlights": 10,
  "totalFreeSeats": 20,
  "bookable": true
}
```

**422** si `date` falta o no es `YYYY-MM-DD`.

---

## `POST /api/bot/v1/reservations`

Scope requerido: `reservations:write`

Crea una reserva. **No hay pago online en este módulo** (Stripe está fuera de alcance) — la reserva se confirma o queda en tentativa en la misma llamada, no hay paso intermedio de pago.

**Body:**
```json
{
  "fullName": "Juan Pérez",
  "phone": "600000000",
  "email": "juan@example.com",
  "packageType": "SOLO",
  "weight": 80,
  "preferredDate": "2026-07-04",
  "source": "DIRECT"
}
```

- `fullName` (requerido)
- `preferredDate` (requerido, `YYYY-MM-DD`)
- `phone`, `email`, `weight`, `source` — opcionales
- `phone` — se acepta cualquier formato razonable ("600 00 00 00", "+34 600-000-000", "0034600000000"...); el sistema lo **normaliza y almacena en forma canónica** `+<código país><número>` (p. ej. `+34600000000`). El bot no necesita normalizar por su cuenta, pero SÍ debe enviar el teléfono siempre que lo tenga: es la clave de la deduplicación (ver respuesta 200 abajo).
- `packageType` — opcional, uno de `SOLO | HANDYCAM | VIDEO_EXTERNO | FOTOS | HANDYCAM_FOTOS` (por defecto `SOLO`)
- `source` — opcional, uno de `DIRECT | GROUPON | BONO | PROMO | SMARTBOX`

> Nota: de momento **una reserva = una persona**. Reservas de grupo (varios participantes en una sola llamada) no están soportadas todavía en este endpoint.

**201 (creada):**
```json
{
  "reservationId": "uuid",
  "token": "uuid",
  "status": "CONFIRMED",
  "dateClassification": "CONFIRMABLE",
  "confirmedDate": "2026-07-04",
  "confirmedTime": "09:00:00",
  "statusUrl": "/reserva/uuid"
}
```

`status` puede ser:
- **`CONFIRMED`** — fecha dentro de la ventana de confirmación inmediata (30 días desde hoy) y con plazas. Ya tiene vuelo real asignado (`confirmedDate`/`confirmedTime`).
- **`TENTATIVE`** — fecha más allá de la ventana de 30 días. Queda parqueada; el sistema la confirma automáticamente (cron diario) en cuanto la fecha entra en la ventana, o el staff la reagenda si para entonces ya no hay sitio. En este caso `confirmedDate`/`confirmedTime` van `null`.

**200 (ya existía — idempotencia por teléfono, v1.1):**

Si el `phone` enviado (una vez normalizado) coincide con un lead **activo** (`NEW`, `TENTATIVE`, `CONFIRMED` o `RESCHEDULE_NEEDED`) con fecha de hoy en adelante — o sin fecha aún —, **no se crea una reserva nueva**: se devuelve la existente con `duplicate: true`.

```json
{
  "reservationId": "uuid",
  "token": "uuid",
  "status": "CONFIRMED",
  "confirmedDate": "2026-07-12",
  "confirmedTime": "09:00:00",
  "statusUrl": "/reserva/uuid",
  "duplicate": true
}
```

Semántica para el bot: **si `duplicate: true`, el cliente ya tiene una reserva activa.** El bot debe informarle de su reserva existente (fecha y estado, usando `status`/`confirmedDate` o consultando `GET /reservations/{token}`) y NO tratarla como una reserva nueva. Si el cliente realmente quiere una segunda reserva (p. ej. reserva para un acompañante desde el mismo teléfono), debe escalarse al staff — el alta manual en `/reservas` muestra el aviso de posible duplicado pero permite crearla.

Diferencias con el 201: código `200`, campo `duplicate: true`, y no incluye `dateClassification` (la clasificación aplica al alta, no a una reserva ya existente; `status` ya refleja su situación real). Reintentos del bot (timeouts, reenvíos de WhatsApp) son seguros: el mismo POST repetido devuelve el mismo lead en vez de duplicarlo.

**409 (no disponible):**
```json
{
  "error": { "code": "unavailable", "message": "The requested date is not available" },
  "suggestedDates": ["2026-07-05", "2026-07-11"]
}
```
Pasa cuando el día está lleno, en meteo-cancelación, o no es día operativo. `suggestedDates` trae hasta 3 alternativas reservables — úsalas para reofrecer al cliente.

**422** si falta `fullName`/`preferredDate` o el formato no es válido.

---

## `GET /api/bot/v1/reservations/{idOrToken}`

Scope requerido: `status:read`

Consulta el estado de una reserva por su `reservationId` o su `token` (ambos funcionan, indistintamente).

**200:**
```json
{
  "id": "uuid",
  "status": "CONFIRMED",
  "depositPaid": false,
  "confirmedDate": "2026-07-04",
  "confirmedTime": "09:00:00",
  "preferredDate": "2026-07-04",
  "packageType": "SOLO",
  "fullName": "Juan Pérez"
}
```

`status` es uno de: `NEW | TENTATIVE | CONFIRMED | RESCHEDULE_NEEDED | CANCELLED | NO_SHOW`.

- `RESCHEDULE_NEEDED` — la reserva estaba confirmada pero el día se canceló por meteorología (o se quedó sin sitio al promocionar una tentativa); hay que ofrecer reagendar.
- `depositPaid` — siempre `false` por ahora (no hay pagos online en este módulo todavía).

**404** si no existe ninguna reserva con ese id/token.

---

## Lo que NO está soportado todavía

- Pagos online / depósito (Stripe) — todo el módulo de reservas excluye esto por ahora.
- Reservas de grupo en una sola llamada (varios participantes).
- Reagendar una reserva vía API (`reschedule`) — de momento solo lo hace el staff manualmente en `/reservas`.
- Cancelar una reserva vía API.

Si el bot necesita alguna de estas piezas, avisa antes de implementarlo del lado del chatbot para priorizarlo del lado del software.
