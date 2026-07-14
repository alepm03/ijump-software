# Pendientes del lado software — integración chatbot (2026-07-13)

Doc de handoff para Alejandro tras la revalidación S21-R del plan del bot WhatsApp (ADR-038 en el repo del chatbot). Nada de esto bloquea el arranque del canal WA; prioridades indicadas.

## 1. Borrar 7 leads de test en `/reservas` (P1 — dos ocupan plaza real)

| Nombre | Teléfono | ID | Nota |
|---|---|---|---|
| `TEST ACTIVACION DEDUPE - BORRAR` | 611000001 | `6502a0e4-320e-4c42-91e3-8a4f8475b7cf` | |
| `TEST E2E DEDUPE V31 - BORRAR` | 620000901 | `0fd1dfe1-2530-48b3-b984-d5bea5e4ae1b` | |
| `TEST E2E DEDUPE V31B - BORRAR` | 620000902 | `027a8413-b65b-4767-a283-8bac4e49b251` | |
| `TEST E2E CREACION 201 - BORRAR` | 620000903 | `da6b07a5-5ef9-48b3-92cc-86f3306c9226` | **CONFIRMED 01/08/2026 08:00 — ocupa plaza** |
| `TEST V26 EN - BORRAR` | 620000801 | `1808b8a7-3375-42f1-b0ad-40be930acfa8` | |
| `Test S21B Reserva BORRAR` | **teléfono incorrecto — ver nota** | `8c514c48-1a19-4dea-847c-453af1b14be8`, token `9493366d-12b0-46b5-b6f1-022bd05256dd` | **TENTATIVE 05/09/2026.** Creada el 14/07 verificando el canal WhatsApp: un bug del bot (agente no conocía el E.164 de su propia sesión) le hizo enviar un teléfono interno de la empresa en vez del teléfono del cliente de prueba. El bug se corrige en el chatbot, no en el software — solo pedimos que se borre este lead (búscalo por nombre o ID). |
| `TEST S21BFIX Reserva BORRAR` | teléfono de test (correcto, ver nota) | `5caa3e05-dd32-414b-a030-8fbbc52ad91b`, token `e07eef71-6706-4998-bf4d-8785733eea8b` | **TENTATIVE 03/10/2026.** Creada el 14/07 verificando el fix del bug de arriba (mismo día, sesión de corrección): esta vez el teléfono que llegó a la API SÍ es el del cliente de prueba de la sesión, confirmando que el fix funciona de principio a fin contra la API real. Solo pedimos que se borre este lead (búscalo por nombre o ID) — el teléfono no se incluye aquí por ser un dato de sesión, no hace falta para localizarlo. |

## 2. Hallazgo del 409 — ✅ RESUELTO (verificado, nada que hacer)

El hallazgo reportado el 07/07 ("el POST que devuelve 409 crea igualmente el lead NEW") ya está arreglado en `src/app/api/bot/v1/reservations/route.ts:121` (`cancelLead` en 409). Verificado en código el 13/07: el reintento del bot con la fecha alternativa ahora crea un lead limpio. Cerrado.

## 3. H4 de AUDITORIA.md — página `/reserva/{token}` no existe (P2, sube con el canal WA)

La API devuelve `statusUrl: /reserva/{token}` pero la página da 404. Mientras tanto el bot NO expondrá `statusUrl` a clientes (decisión ADR-038). Para el canal WhatsApp sería un buen enlace de autoconsulta de estado.

**Actualización 13/07:** lo implementamos nosotros en la rama `feature/chatbot-h4-h7` — te llega PR para review, no hace falta que lo hagas tú.

## 4. H7 de AUDITORIA.md — bug lógico en `rescheduleLead` (P2)

`src/lib/actions/leads.ts:161-166`: libera la plaza y pone `NEW` antes de comprobar disponibilidad de la fecha nueva. Ya identificado en tu auditoría; relevante porque el flujo de posposición meteo del bot (S21-D) acabará apoyándose en reagendados del staff.

**Actualización 13/07:** también va en la rama `feature/chatbot-h4-h7` (mismo PR).

## 5. Nice-to-haves para futuras versiones de la API bot (P3, no urgente)

- **Escalados:** endpoint (o ampliación) para escribir una nota + `last_contact_at` en el lead cuando el bot escala a humano. Hoy se cubre por email (gap documentado en el runbook del dedupe).
- **Sync de depósito:** el pipeline de depósito (solicitud, justificante, verificación) vive en el Supabase del chatbot (decisión ADR-038: el software es fuente de verdad de reserva/plaza; el bot, del pipeline de cobro conversacional). A futuro convendría sincronizar la verificación con `deposit_paid`: o un endpoint PATCH acotado, o que el staff lo marque a mano en `/reservas`. Lo hablamos cuando el canal WA esté vivo.

---
*Generado en sesión S21-R (13/07/2026). Contexto completo: `chatbot/DECISIONES.md` ADR-038 y `chatbot/STATUS.md`.*
