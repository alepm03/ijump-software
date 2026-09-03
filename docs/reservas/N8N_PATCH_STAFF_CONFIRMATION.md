# Parche n8n — `requiresStaffConfirmation` (fase de transición, 2026-09)

**Para:** Ricardo — workflow `iJump - Tool Crear Reserva - Chatbot web`, nodo **`Finalizar observacion`**.

## Por qué

`POST /api/bot/v1/reservations` ya no confirma la reserva por su cuenta mientras
sigan entrando reservas por el canal antiguo (ver el aviso de fase de transición en
`BOT_API_CONTRACT.md`). Ahora devuelve `201` con `status: "NEW"` y
`requiresStaffConfirmation: true`, y la reserva espera en `/reservas → pendientes`.

**Sin este parche el bot miente al cliente:** el código actual ramifica con
`body.status === 'CONFIRMED'`, así que un `NEW` cae en el `else` y suelta
*"anotada como TENTATIVA; se confirma automáticamente al entrar en ventana"* —
falso: el cron diario solo promociona leads `TENTATIVE`, nunca `NEW`. Esa reserva
no se confirma sola nunca.

## Cambio

Sustituir **solo** el bloque `if (sc === 201) { ... }` por:

```js
if (sc === 201) {
  const p = { ...dec.base_payload,
    api_reservation_id: body.reservationId ?? null,
    api_token:          body.token ?? null,
    api_status:         body.status ?? null };
  const api = { reservationId: body.reservationId ?? null, token: body.token ?? null,
                status: body.status ?? null, confirmedDate: body.confirmedDate ?? null,
                confirmedTime: body.confirmedTime ?? null,
                requiresStaffConfirmation: body.requiresStaffConfirmation === true };

  // Fase de transicion: la reserva esta anotada pero NO tiene plaza asignada.
  // No prometer fecha ni hora al cliente.
  if (body.requiresStaffConfirmation === true) {
    return [{ json: { success: true, payload: p, api, mensaje: MSG_CLASSIC } }];
  }

  return [{ json: { success: true, payload: p, api,
    mensaje: body.status === 'CONFIRMED'
      ? 'Reserva CONFIRMADA con fecha y hora reales (api.confirmedDate / api.confirmedTime). Comunicalas al cliente en formato espanol y recuerda el deposito de 60 euros.'
      : 'Reserva anotada como TENTATIVA; se confirma automaticamente al entrar en ventana. Recuerda el deposito de 60 euros.' } }];
}
```

`MSG_CLASSIC` ya existe en el nodo (es el mensaje del fallback clásico:
*"Reserva anotada correctamente. Un miembro del equipo te contactará en 24-48h..."*),
que describe exactamente el circuito nuevo. No hace falta declarar nada más.

El resto del nodo (`200 duplicate`, `409`, fallback) no cambia.

## Nota

Ramificar por `requiresStaffConfirmation`, no por `status`. Cuando el flag
`bot_autoconfirm_enabled` de `business_settings` se ponga a `true` (fin de la
transición), la API volverá a devolver `CONFIRMED` con
`requiresStaffConfirmation: false` y este mismo código sigue siendo correcto sin
tocar nada.
