# Auditoría de Seguridad y Calidad de Código — iJump Operational System

**Fecha:** 2026-07-03 · **Actualizado:** 2026-07-05
**Alcance:** código en `src/`, migraciones en `supabase/migrations/`, configuración (`next.config.ts`, `vercel.json`, `.gitignore`, `.env.local`), dependencias (`npm audit`).
**Fuera de alcance / no verificable desde el repo:** configuración real del proyecto Supabase en producción (RLS aplicado, bucket, claves), variables de entorno de Vercel (`CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`), repo del chatbot de Ricardo. Donde algo depende de eso, se indica explícitamente.

---

## 1. Resumen ejecutivo

**Nivel de riesgo general: MEDIO** (en descenso — los tres hallazgos de severidad Alta están resueltos).

> **Actualización 2026-07-05 — hallazgos resueltos en `main`:**
> - ✅ **H1** — PDF del waiver generado en servidor + validación Zod/firma (PR #49)
> - ✅ **H2** — Rutas de Storage únicas por registro + `upsert: false` (PR #53, recreación del #51 que GitHub cerró al borrarse su rama base). Los documentos firmados antes del fix permanecen en las carpetas por nombre del esquema antiguo.
> - ✅ **H3** — Cron fail-closed sin `CRON_SECRET` (PR #52). Requiere la variable creada en Vercel + redeploy para que el cron diario funcione.
> - ⚠️ **H4 sube de urgencia**: el contrato v1.1 del bot (PR #50) también devuelve `statusUrl: /reserva/{token}` en la respuesta `duplicate: true`, y la página sigue sin existir. Es el siguiente a resolver.

La base de seguridad del proyecto es notablemente mejor que la media de un MVP:

- **RLS bien planteado**: todas las políticas son `TO authenticated` (`20260525000000_initial_schema.sql:195-214` y siguientes). Las Server Actions usan el cliente de cookies, así que una invocación sin sesión corre como `anon` y la base de datos la bloquea. Esto es lo que sostiene todo el modelo, y está bien hecho.
- **API del bot correcta**: API key hasheada con SHA-256 (nunca en claro), scopes por clave, rate limiting atómico en Postgres con `Retry-After`, validación con Zod (`src/lib/api/auth.ts`, `src/lib/api/rate-limit.ts`, `src/app/api/bot/v1/*`).
- **Secretos bien gestionados**: `.env*` está en `.gitignore` y **verificado que no está trackeado en git** (`git ls-files`). La service role key no lleva prefijo `NEXT_PUBLIC_`. El cliente service se usa solo en server (bot API, cron, waiver público).
- **Sin inyección detectada**: supabase-js parametriza todo; el único punto de interpolación en un filtro (`.or()` en `leads.ts:380`) está protegido por un regex UUID previo (`leads.ts:356,374`). No hay `dangerouslySetInnerHTML`, `eval` ni SQL crudo con input de usuario.
- **Concurrencia tratada en serio**: asignación de plazas vía RPC con `SELECT ... FOR UPDATE`, cierre de caja protegido por constraint UNIQUE con rollback manual del header.

Los riesgos reales se concentran en tres zonas: **el flujo público de firma de waivers** (documento legal generado en el cliente + posibilidad de sobrescritura en Storage), **configuración** (sin cabeceras de seguridad, un bypass condicional del cron si falta `CRON_SECRET`), y **deuda menor** (mensajes de error crudos al cliente, dependencias con vulnerabilidades conocidas, página `/reserva/[token]` referenciada pero inexistente).

No se ha encontrado ningún hallazgo de severidad **Crítica** (nada que permita a un anónimo leer/escribir datos hoy, asumiendo que las migraciones están aplicadas tal cual en producción).

---

## 2. Tabla de hallazgos

| # | Severidad | Archivo / línea | Descripción | Recomendación |
|---|-----------|-----------------|-------------|---------------|
| H1 | **Alta** | `src/lib/actions/waiver.ts:120-167` + `src/app/waiver/[token]/WaiverSigningForm.tsx:180-187` | **El PDF del waiver (documento legal) se genera en el navegador del cliente** y se sube tal cual vía la acción pública `submitWaiver` (service client, sin RLS). Quien tenga un token válido —incluido el propio participante— puede enviar un PDF con cualquier contenido: el documento archivado puede no corresponder al texto legal mostrado. El `formData` tampoco se valida en servidor (solo tipado TS, que no existe en runtime) ni se limita el tamaño del base64. | Generar el PDF en el servidor a partir del `formData` + firma (jsPDF funciona en Node), o al menos: validar `formData` con Zod, limitar tamaño de `pdfBase64`/`signatureBase64`, y verificar que el base64 decodificado es un PDF (`%PDF-` magic bytes). |
| H2 | **Alta** | `src/lib/actions/waiver.ts:139-166` | **Sobrescritura de documentos firmados en Storage.** La ruta del fichero se construye con `formData.fullName` (controlado por el cliente) + fecha + tipo, y se sube con `upsert: true`. Dos participantes con el mismo nombre que firmen el mismo día se sobrescriben mutuamente; un atacante con un token pendiente puede sobrescribir deliberadamente el waiver de otro cliente si conoce su nombre y fecha de firma. Pérdida de evidencia legal. | Incluir `participant_id` o `waiver.id` en la ruta (`{participantId}/{docLabel}/...`) y cambiar a `upsert: false`. |
| H3 | **Alta** ⚠️ condicional | `src/app/api/cron/promote-leads/route.ts:25` | Si `CRON_SECRET` **no** está definida en Vercel, `Bearer ${process.env.CRON_SECRET}` evalúa a la cadena literal `"Bearer undefined"`: cualquiera que envíe ese header ejecuta el cron (usa service client). **No verificable desde el repo si la variable está configurada en Vercel** — si lo está, el riesgo real es bajo (el endpoint solo promueve leads TENTATIVE), pero el patrón es frágil. | Fallar cerrado: `if (!process.env.CRON_SECRET \|\| authHeader !== ...) return 401`. Verificar hoy mismo que `CRON_SECRET` existe en el proyecto de Vercel. |
| H4 | **Media** | `src/app/api/bot/v1/reservations/route.ts:101` + `src/proxy.ts:9` | La API devuelve `statusUrl: /reserva/${token}` y el proxy trata `/reserva/` como ruta pública, pero **la página `src/app/reserva/[token]/page.tsx` no existe** (verificado con glob; solo existe en los planes archivados de la fase Stripe). El bot dará a clientes un enlace que responde 404. | Implementar la página pública de estado (clon del patrón `/waiver/[token]`) o eliminar `statusUrl` del contrato y de la respuesta hasta que exista. Actualizar `docs/reservas/BOT_API_CONTRACT.md:120` en consecuencia. |
| H5 | **Media** | `next.config.ts` (vacío) | **Sin cabeceras de seguridad**: no hay CSP, `X-Frame-Options`/`frame-ancestors` (clickjacking sobre el login y el waiver público), `X-Content-Type-Options`, ni `Referrer-Policy`. HSTS lo añade Vercel automáticamente en `*.vercel.app`, pero habría que verificarlo si se mueve a dominio propio. | Añadir `headers()` en `next.config.ts` con al menos `X-Frame-Options: DENY` (o CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. CSP completa puede venir después (Next necesita nonces para inline scripts). |
| H6 | **Media** | Patrón generalizado: `leads.ts`, `participant.ts`, `payment.ts`, `waiver.ts`, `finance.ts` (`return { error: error.message }`) | Las Server Actions devuelven al navegador el `error.message` crudo de Postgres/PostgREST (nombres de tablas, constraints, detalles de esquema). El route de export lo hace bien (`finanzas/export/route.ts:258-266`: log server-side + mensaje genérico); las actions no. | Interceptar y mapear: loggear el detalle en servidor, devolver un mensaje genérico o un código de error. Ya existe el patrón correcto en `moveParticipants` (`participant.ts:215-225`) — extenderlo. |
| H7 | **Media** | `src/lib/actions/leads.ts:161-166` (`rescheduleLead`) | **Bug lógico**: libera el asiento actual (`freeSeat`) y pone `lead_status='NEW'` *antes* de comprobar la disponibilidad de la nueva fecha. Si la nueva fecha resulta UNAVAILABLE, el lead ha perdido su plaza original y queda como `NEW` sin vuelo. El flujo batch (`rescheduleLeadsBatch:201-208`) restaura `RESCHEDULE_NEEDED`, pero el reschedule individual no restaura nada. | Comprobar disponibilidad de la fecha destino antes de liberar el asiento (o restaurar estado/plaza si la confirmación falla, como hace el batch). |
| H8 | **Media** | `package.json` / `npm audit` | **7 vulnerabilidades conocidas** (1 high, 6 moderate), todas transitivas: `hono` <4.12.25 (high, CORS credentials — arrastrada por tooling), `exceljs`→`uuid` (moderate), `dompurify` ≤3.4.10 (vía jspdf), `next`→`postcss` <8.5.10 (moderate). Ninguna es explotable de forma obvia en los flujos actuales (p. ej. `hono` no se usa en runtime de la app), pero envejecerán. | `npm audit fix` para las que tienen fix no-breaking; evaluar actualización de `exceljs` y `jspdf`. Añadir `npm audit` al checklist de PR o una GitHub Action (dependabot). |
| H9 | **Media** | `src/app/api/bot/v1/reservations/route.ts:26-34` | El schema Zod del bot no limita longitudes: `fullName`, `phone`, `email` sin `.max()`. Un bot comprometido (o el propio n8n con un prompt injection en el chatbot) puede insertar strings enormes o basura en `participants`, que luego se renderizan en el manifest del staff. | Añadir `.max()` razonables (`fullName` 120, `phone` 30, `email` ya valida formato) y `.trim()`. Aplicar lo mismo a `CreateParticipantData` cuando se valide (ver H10). |
| H10 | **Media** | Todas las Server Actions de staff (`payment.ts:15-30`, `participant.ts:53`, `finance.ts`, etc.) | **Sin validación runtime de inputs**: las actions confían en los tipos TS, que no existen en el wire. `createPayment` acepta `amount` negativo, `NaN` o `1e300`; `updateParticipant` acepta strings arbitrarios. Mitigado hoy porque requiere sesión autenticada y hay una sola cuenta admin, pero cada action es un endpoint HTTP real. | Validar con Zod en la entrada de cada action de mutación (ya es dependencia). Prioridad: `payments` (dinero) y todo lo que el futuro multi-usuario toque. Añadir `CHECK (amount >= 0)` en la tabla `payments` como red de seguridad. |
| H11 | **Media** | `src/lib/actions/auth.ts:9-26` + login | **Sin rate limiting propio en el login** (solo el throttling por defecto de Supabase Auth) y sin protección adicional (captcha/MFA) para una cuenta admin compartida que da acceso total a datos personales y financieros. | A corto plazo: activar la protección de contraseña/captcha en el dashboard de Supabase Auth. A medio: cuentas individuales por persona + MFA (Supabase lo soporta) en lugar de una cuenta compartida. |
| H12 | **Baja** | `supabase/migrations/20260622000000_reservations.sql:94-95` | Cualquier usuario autenticado puede leer `api_keys` (`key_hash`, scopes, límites). Los hashes de claves de alta entropía no son reversibles, así que el impacto hoy (1 cuenta) es mínimo, pero es información que el frontend no necesita. | Eliminar la política `SELECT` para `authenticated` (la API usa el service client, que no la necesita) o restringir columnas con una vista. |
| H13 | **Baja** | `src/lib/api/rate-limit.ts:21-23` | Si el RPC `bump_rate_limit` falla, se devuelve `error.message` interno con status 500 al consumidor de la API. | Mensaje genérico + log server-side (mismo patrón que H6). |
| H14 | **Baja** | `supabase/migrations/20260622000000_reservations.sql:62-68` | `api_rate_limits` acumula una fila por clave y minuto para siempre; no hay purga. No es un riesgo de seguridad, pero crecerá indefinidamente. | Borrar ventanas antiguas dentro del propio `bump_rate_limit` (`DELETE ... WHERE window_start < now() - interval '1 hour'`) o un cron de limpieza. |
| H15 | **Baja** | `src/lib/actions/auth.ts:15-16` | `formData.get('email') as string` — si el campo no viene, se pasa `null` casteado a `signInWithPassword`. No es explotable (falla el login), pero es un cast sin control. | Validar presencia y tipo antes del cast. |
| H16 | **Baja** | `src/lib/actions/waiver.ts:170-176` | Las signed URLs de Storage de 10 años se guardan en la tabla `waivers`. Son secretos de vida larguísima persistidos en DB, y se invalidan si algún día se rotan las claves del bucket (los PDFs "desaparecerían" del staff UI aunque sigan en Storage). | Guardar solo el `path` y generar signed URLs cortas bajo demanda cuando el staff descarga (ya hay sesión autenticada y política de lectura en el bucket). |
| H17 | **Baja** | `src/hooks/useRealtimeManifest.ts:25-34` | Las suscripciones realtime a `participants` y `payments` van **sin filtro** (a diferencia de `flights`/`operational_days`): cualquier cambio en cualquier día provoca `router.refresh()` en todos los manifests abiertos. Correcto funcionalmente, ruidoso en rendimiento. | Filtrar por los participantes/vuelos del día cuando Supabase Realtime lo permita (filtro `in`), o aceptarlo y documentarlo. |
| H18 | **Baja** | `package.json:34` | `shadcn` (CLI de scaffolding, arrastra `hono` — ver H8) está en `dependencies` en lugar de `devDependencies`. | Moverlo a `devDependencies` (probablemente elimine el hallazgo high de `npm audit` del árbol de producción). |
| H19 | **Info** | `src/proxy.ts:44-47` | El proxy usa `getSession()` (lee la cookie sin verificar firma del JWT). Está **documentado y mitigado**: el layout del dashboard re-verifica con `getUser()` (`(dashboard)/layout.tsx:11-16`) y los datos reales los protege RLS. Correcto como está; se lista para que nadie "optimice" quitando el `getUser()` del layout. | Mantener el `getUser()` del layout como invariante. |
| H20 | **Info** | Modelo de acceso global | No hay roles ni permisos: cualquier sesión autenticada tiene acceso total (finanzas, datos personales, borrado). Decisión consciente del MVP (una cuenta admin), pero será el primer muro cuando entre más personal. | Al pasar a multi-usuario: tabla de roles + políticas RLS por rol; las políticas actuales `USING (TRUE)` son el punto a cambiar. |

---

## 3. Checklist OWASP Top 10 (2021)

| Categoría | Estado | Evidencia |
|---|---|---|
| **A01 — Broken Access Control** | 🟡 Parcial | ✅ RLS `TO authenticated` en todas las tablas; Server Actions con cliente anon bloqueado; layout re-verifica `getUser()`; bucket de waivers privado. ❌ Sin roles (H20); `api_keys` legible por authenticated (H12). |
| **A02 — Cryptographic Failures** | ✅ Cumple | API keys hasheadas SHA-256, nunca en claro (`lib/api/auth.ts`); TLS gestionado por Vercel/Supabase; sin criptografía casera. Nota: SHA-256 sin salt es aceptable *solo* porque las claves son de alta entropía — no reutilizar el patrón para contraseñas. |
| **A03 — Injection (SQL/XSS/command)** | ✅ Cumple | supabase-js parametrizado en todo el código; interpolación en `.or()` protegida por regex UUID (`leads.ts:374-380`); sin `dangerouslySetInnerHTML`/`eval` (grep verificado); React escapa por defecto; RPCs con parámetros tipados; sin `exec`/shell. |
| **A04 — Insecure Design** | 🟡 Parcial | ✅ Motores puros testeados, asignación de asientos atómica en PG, idempotencia en cierres e itemización. ❌ Documento legal generado en el cliente (H1) — es un fallo de diseño, no de implementación. |
| **A05 — Security Misconfiguration** | ❌ No cumple | Sin cabeceras de seguridad (H5); `CRON_SECRET` con fallo abierto si falta (H3); `shadcn` en deps de producción (H18). ✅ `.env` fuera de git, service key sin `NEXT_PUBLIC_`. |
| **A06 — Vulnerable & Outdated Components** | ❌ No cumple | `npm audit`: 1 high + 6 moderate (H8). Sin proceso automatizado de revisión de dependencias. |
| **A07 — Identification & Auth Failures** | 🟡 Parcial | ✅ Supabase Auth (bcrypt, sesiones gestionadas), redirect middleware + verificación server-side, API del bot con claves revocables y scopes. ❌ Cuenta admin única compartida, sin MFA, sin rate limit propio de login (H11). |
| **A08 — Software & Data Integrity Failures** | ❌ No cumple | PDF de waiver manipulable por el cliente (H1) y sobrescribible en Storage (H2). ✅ CSRF cubierto: Server Actions de Next verifican Origin/Host por defecto; los route handlers mutantes exigen API key. |
| **A09 — Security Logging & Monitoring** | ❌ No cumple | Solo `console.error` disperso; sin log de auditoría de acciones sensibles (borrados, pagos, cierres de caja, uso de API keys más allá de `last_used_at`); sin alertas. ✅ No se loggean contraseñas ni tokens (verificado en los 69 usos de console.*). |
| **A10 — SSRF** | ✅ N/A | El servidor no hace fetch de URLs controladas por el usuario. |

---

## 4. Recomendaciones priorizadas

**Antes de conectar el chatbot de n8n (esta semana):**

1. **Verificar `CRON_SECRET` en Vercel** y aplicar el fail-closed de H3 — 5 minutos, elimina el único bypass potencial de auth.
2. **Decidir qué hacer con `statusUrl`** (H4): o se implementa `/reserva/[token]` o se quita del contrato del bot *antes* de que Ricardo lo consuma en R5 — cambiar el contrato después dolerá más.
3. **Límites de longitud en el schema Zod del bot** (H9) — el chatbot es exactamente el vector por el que entrará input hostil (prompt injection → datos basura).

**Corto plazo (próximo sprint):**

4. **Endurecer el flujo de waivers** (H1 + H2): ruta de Storage con `participant_id` + `upsert: false` es un cambio de 5 líneas que elimina la sobrescritura; la validación Zod de `formData` y el límite de tamaño, una tarde. La generación server-side del PDF puede planificarse como tarea propia.
5. **Cabeceras de seguridad** en `next.config.ts` (H5) — 20 minutos.
6. **Sanitizar mensajes de error de las actions** (H6, H13) — un helper `toUserError()` y aplicarlo mecánicamente.
7. **`npm audit fix`** + mover `shadcn` a devDependencies (H8, H18).

**Medio plazo (cuando toque, pero que no se olvide):**

8. Validación Zod en Server Actions de mutación, empezando por `payments` (H10), + `CHECK (amount >= 0)` en DB.
9. Fix del `rescheduleLead` individual (H7) — mismo patrón de restauración que ya existe en el batch.
10. Cuentas individuales + MFA cuando entre más personal (H11), y en ese momento diseñar roles (H20).
11. Log de auditoría mínimo (tabla `audit_log` con actor, acción, entidad, timestamp) para pagos, borrados y cierres de caja — barato ahora, imposible de reconstruir después.
12. Housekeeping: purga de `api_rate_limits` (H14), signed URLs bajo demanda (H16), quitar política SELECT de `api_keys` (H12).

---

## 5. Lo que está bien (mantener como está)

Para que el próximo refactor no rompa lo que funciona:

- El patrón **cliente-cookies-por-defecto + service client solo con justificación explícita** (bot API, cron, waiver por token) está aplicado con disciplina. Cada uso de `createServiceClient()` tiene un comentario justificándolo.
- La **API del bot** (auth por hash + scopes + rate limit atómico en PG) es un diseño correcto y simple; el contrato en `docs/reservas/BOT_API_CONTRACT.md` está sincronizado con el código salvo H4.
- El guard `UUID_RE` antes del `.or()` interpolado en `getLeadByIdOrToken` es exactamente la defensa correcta para ese patrón de PostgREST.
- La lógica sensible a concurrencia (asientos, cierre de caja, número de vuelo) vive en Postgres con locks/constraints, no en JS — es la decisión correcta.
- `finanzas/export/route.ts` es el modelo a seguir para el resto: auth guard, validación de params, mensajes de error genéricos con log server-side y `Cache-Control: no-store`.
