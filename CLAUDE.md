@AGENTS.md

# iJump Operational System — CLAUDE.md

> Lee este archivo completo al inicio de cada sesión. Contiene el contexto del proyecto, el workflow de colaboración y las reglas que deben respetarse siempre.

---

## Qué es este proyecto

Sistema operacional para un centro de paracaidismo tándem. Sustituye un Excel + WhatsApp + papel por una aplicación web moderna. El núcleo del sistema NO es la gestión de clientes: es el **Manifest Operacional Diario**.

---

## Equipo y modelo de acceso

| Persona | Handle | Rol | Acceso git |
|---|---|---|---|
| Ricardo | ricardopm01 / Edrai | Estrategia, producto, IA/chatbot, auditoría | Push de feature branches; nunca mergea a `main` él solo |
| Hermano (Aleandro) | alepm03 | Propietario del repo, implementación técnica | Merge de PRs a `main`; acceso directo a Supabase |

**Regla de sincronización entre los dos:** el canal de coordinación son los PRs y los documentos en `docs/`. No se trabajan los mismos archivos en paralelo sin coordinarlo antes. Si Ricardo y el hermano tienen sesiones activas al mismo tiempo, cada uno trabaja en su propia rama.

---

## Cómo trabaja Claude — workflow de sesión

### Al abrir una sesión nueva
1. Lee este `CLAUDE.md` (se carga automáticamente).
2. Ejecuta `git log --oneline -5` y `git branch` para saber en qué rama estás y cuál es el último estado.
3. Si hay trabajo pendiente, busca un archivo de plan en `.claude/plans/` o un `tasks/todo.md`.
4. Antes de tocar código, confirma con el usuario qué quiere hacer en esta sesión.

### Al cerrar una sesión
1. Commit de todo lo que esté listo con mensaje en inglés e imperativo.
2. Push de la rama.
3. Si el trabajo está completo, abre PR hacia `main` via `gh pr create`.
4. Actualiza los documentos relevantes (ver §Qué actualizar).
5. Nunca dejes la rama en estado roto. Si algo no está terminado, deja un `// TODO:` con contexto y documéntalo en el PR.

### Regla anti-confusión de worktrees
El único directorio de trabajo activo es `ijump-software/` (rama `main`). Si ves otras carpetas (`ijump-software-*`), son worktrees temporales de ramas antiguas — no trabajes en ellas.

---

## Sesiones complejas: planes, tareas y subagentes

### Cuándo usar plan mode
- Tareas de 3+ pasos o que impliquen decisiones de arquitectura.
- Antes de modificar migraciones o la estructura de base de datos.
- Cuando no estés seguro de las consecuencias de un cambio en el resto del sistema.
- Para fixes obvios de una línea: hazlo directo, sin plan.

### Cuándo usar TaskCreate
- Implementaciones que se extiendan más de ~30 minutos.
- Cuando hay múltiples entregables (migración + tipos + UI + tests).
- Marca cada tarea `completed` en cuanto termines, no al final de todo.

### Cuándo usar subagentes
- **Exploración de código** sin ensuciar el contexto principal: subagente `Explore` apuntado a archivos concretos.
- **Revisión antes de un PR**: subagentes `code-reviewer` + `security-auditor` en paralelo.
- **Implementación de entregables independientes**: un subagente `claude` por cada uno (migración, motor, UI...).
- **NO usar** para tareas de menos de 15 minutos o cuando ya tienes el contexto claro — el coste supera el beneficio.

### División de sesiones entre Ricardo y el hermano
- Ricardo: diseño, estrategia, documentación, IA/chatbot (repo del chatbot).
- Hermano: implementación técnica en este repo (R1–R4 del sistema de reservas).
- Punto de sincronización: PRs + documentos en `docs/`.
- Si Ricardo trabaja en una feature y el hermano en otra: ramas distintas, sin tocar los mismos archivos.

---

## Flujo de ramas y PRs

### Convención de nombres
| Tipo | Prefijo | Ejemplo |
|---|---|---|
| Nueva funcionalidad | `feature/` | `feature/reservations-availability` |
| Corrección de bug | `fix/` | `fix/flight-reorder-index` |
| Documentación / setup | `docs/` | `docs/project-setup` |
| Hotfix urgente | `hotfix/` | `hotfix/payment-calculation` |
| Refactor sin cambio funcional | `refactor/` | `refactor/participant-actions` |

### Reglas
- **Nunca** hacer commits directamente sobre `main`.
- Cada rama cubre **una sola funcionalidad o fix**.
- Mensajes de commit en inglés, imperativo: `Add flight reorder logic`.
- Co-autoría al final del mensaje: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- **Abrir PR** cuando la rama esté lista. El hermano revisa y mergea.
- **Borrar la rama remota** después del merge (`git push origin --delete <rama>`).
- Ricardo puede hacer push de cualquier feature branch. Solo el hermano mergea a `main`.

### Flujo habitual
```bash
git checkout main && git pull
git checkout -b feature/nombre-descriptivo
# trabajar, testear...
git add <files> && git commit -m "Add: descripción"
git push -u origin feature/nombre-descriptivo
gh pr create --title "..." --body "..."
```

---

## Qué actualizar después de cada tipo de cambio

| Cambio | Qué actualizar |
|---|---|
| Nueva tabla o columna | `supabase/migrations/`, regenerar `src/lib/supabase/database.types.ts`, actualizar `docs/[MODULO]_INTEGRATION.md` |
| Nuevo módulo grande | Crear `docs/[MODULO]_INTEGRATION.md` como guía post-merge (ver `docs/FINANCE_V2_INTEGRATION.md` como plantilla) |
| Cambio en design system | `docs/DESIGN_SYSTEM.md` + reglas en este `CLAUDE.md` (§Sistema de diseño) |
| Nuevo enum o tipo de dominio | `src/types/domain.ts` + `database.types.ts` |
| Merge de PR a main | Borrar rama remota, actualizar §Estado actual en este `CLAUDE.md` |
| Cambio en env vars | Actualizar §Supabase y notificar al otro para que actualice su `.env.local` |

---

## Estado actual del software

> Actualizar esta sección después de cada merge a `main`.

| Módulo | Estado | PR |
|---|---|---|
| Manifest operacional diario | ✅ Producción | — |
| UI redesign v4 (design system OKLCH, sidebar, logo) | ✅ Producción | #19 |
| Finanzas v2 (P&L, KPI dashboard, catálogo, export Excel/CSV/PDF) | ✅ Producción | #20 |
| Finanzas v2.1 (reclasificación de gastos COSTES_DIRECTOS/COMISIONES + comisiones por canal ajustables) | 🔄 En PR | `feature/finance-expense-model` |
| Sistema de reservas (lead → confirmación/tentativa → manifiesto, sin pago online) | ✅ Producción (R1–R10) | #23, #25–#37 (ver `docs/reservas/CHECKLIST.md`) |
| API del bot v1 (chatbot → software: disponibilidad, crear/consultar reserva) | ✅ Producción | #37 — contrato en `docs/reservas/BOT_API_CONTRACT.md` |
| Chatbot rewire (R5 — lado Ricardo, consumir la API del bot) | ⏳ Pendiente (lado Ricardo) | — |

### Lo que NO está en scope (aún)
- CRM avanzado
- Automatización WhatsApp con IA (viene en R5, lado Ricardo)
- Multimedia / vídeos
- App móvil cliente
- Multi-empresa / multi-avión
- Múltiples manifests
- Pagos online / depósito (Stripe) — excluido de todo el módulo de reservas, fase futura separada
- Reservas de grupo vía API del bot (una reserva = una persona por ahora)
- Reagendar/cancelar una reserva vía API del bot (solo desde `/reservas` por el staff)

---

## Módulo completado: Sistema de reservas

**Lead → confirmación/tentativa → manifiesto + API del bot, sin pago online.** Implementado en R1–R10 (todo el lado hermano/alepm03); pendiente solo R5 del lado de Ricardo (rewire del chatbot para consumir la API).

### Documentación de referencia
```
docs/reservas/CHECKLIST.md             # Estado real fase por fase (fuente de verdad de progreso)
docs/reservas/RESERVATIONS_INTEGRATION.md  # Guía post-merge: arquitectura, decisiones, qué tocar para extenderlo
docs/reservas/BOT_API_CONTRACT.md      # Contrato final de la API del bot — para Ricardo (R5)
docs/reservas/RESERVAS_MASTER_PLAN_v2.md   # Estrategia y decisiones de arquitectura (referencia histórica)
docs/reservas/RESERVAS_TECH_APPENDIX_v2.md # SQL/diseño original (referencia histórica — incluye Stripe, fuera de alcance real)
docs/reservas/RESERVAS_MODULE_PLAN_v1.md   # Plan preliminar (referencia histórica, ver nota de corrección al inicio del archivo)
```

### Decisiones humanas que quedaron pendientes (🔵, no bloqueantes para lo ya implementado)
- Capacidad real: `max_flights_per_day` y nº instructores/avión (confirmar con Raúl) — actualmente seed por defecto en `business_settings`.
- Política de reembolso/cancelación + privacidad/T&C publicados — solo relevante si se retoma Stripe en una fase futura.
- Pago online (Stripe), importe de depósito y si es reembolsable — módulo completo excluido por ahora.

---

## Stack tecnológico

- **Frontend**: Next.js 16 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
- **State**: Zustand (estado local UI), TanStack Table (tablas), DnD Kit (drag & drop)
- **Backend**: Next.js Server Actions + Route Handlers (sin backend separado)
- **DB**: PostgreSQL via Supabase
- **Auth**: Supabase Auth (una cuenta admin en MVP)
- **Realtime**: Supabase Realtime (sincronización en tiempo real del manifest)
- **Storage**: Supabase Storage (PDFs, firmas, documentos)
- **Hosting**: Vercel

---

## Dominio — conceptos clave

### OperationalDay
Entidad central. Representa una jornada completa de saltos. Contiene vuelos, participantes, métricas y pagos. Todo gira alrededor de esto.

### Flight
Un vuelo individual dentro de una jornada. Máximo 2 participantes (tándem). Puede tener cámara externa (ocupa plaza). Dinámico: se añade, elimina, reordena en tiempo real.

### Participant
Persona individual que salta. Tiene su propio estado operativo, instructor, pago y documentación. También actúa como **lead** cuando `flight_id IS NULL` (reserva futura pendiente de confirmar).

### ReservationGroup
Agrupación comercial de participantes (ej. familia que reserva junta). El pago puede ser individual o a través de un pagador principal.

### Payment
Desacoplado del participante. Tiene método (EFECTIVO, TARJETA, BIZUM, TRANSFERENCIA, GROUPON) y etapa (RESERVA, LIQUIDACION, SUPLEMENTO).

---

## Enums importantes

```typescript
PackageType: SOLO | HANDYCAM | VIDEO_EXTERNO | FOTOS | HANDYCAM_FOTOS

ReservationSource: DIRECT | GROUPON | BONO | PROMO | SMARTBOX

PaymentMethod: EFECTIVO | TARJETA | BIZUM | TRANSFERENCIA | GROUPON

PaymentStage: RESERVA | LIQUIDACION | SUPLEMENTO

OperationalStatus: PENDING | CHECKED_IN | WAIVER_SIGNED | BRIEFED | GEARED_UP | READY | COMPLETED | CANCELLED | NO_SHOW | WEATHER_CANCELLED

FlightStatus: SCHEDULED | BOARDING | IN_AIR | COMPLETED | DELAYED | CANCELLED
```

---

## Sistema de diseño — reglas obligatorias

Toda nueva UI debe seguir este sistema sin excepción. Ver `docs/DESIGN_SYSTEM.md` para la referencia completa.

### Tema y color
- **Light mode únicamente** — no hay dark mode en este proyecto.
- **Color space**: OKLCH vía variables CSS (`--background`, `--foreground`, `--primary`, etc.).
- **Acento de marca**: naranja corporativo — usar siempre `bg-primary`, `text-primary`, `hover:bg-primary/90`.
- **Nunca** usar `bg-zinc-900`, `bg-zinc-800`, `text-white`, `bg-sky-600` ni ningún color hardcodeado de Tailwind para superficies o texto.
- Usar exclusivamente tokens semánticos: `bg-background`, `bg-card`, `bg-secondary`, `text-foreground`, `text-muted-foreground`, `border-border`.

### Tokens de referencia rápida
| Propósito | Token |
|---|---|
| Fondo principal | `bg-background` |
| Tarjetas / superficies | `bg-card` |
| Hover / tint de marca | `bg-secondary` |
| Texto principal | `text-foreground` |
| Texto secundario | `text-muted-foreground` |
| Bordes | `border-border` |
| Acento naranja | `bg-primary` / `text-primary` |
| Texto sobre naranja | `text-primary-foreground` |
| Sidebar | `bg-sidebar` |
| Texto pequeño estándar | `text-sm` (12–13px) |
| Texto muy pequeño | `text-2xs` (10px, token custom) |
| Título de sección | `text-title` (18px, token custom) |

### Componentes y patrones
- **Badges de estado**: pill redondeado (`rounded-full`), fondo suave claro + texto de color. Ejemplo: `bg-blue-50 text-blue-600`.
- **Nav activo en sidebar**: `bg-secondary text-primary font-semibold` — nunca `border-left` como acento.
- **CTAs primarios**: `bg-primary hover:bg-primary/90 text-primary-foreground`.
- **Botones fantasma**: `text-muted-foreground hover:text-foreground hover:bg-secondary`.
- **Modales / Sheets / Dialogs**: sin clases de color explícitas — los tokens de shadcn/ui ya aplican el tema.
- **Inputs en edición inline**: `bg-background border border-input rounded focus:ring-ring`.
- **Destructive**: `text-destructive` / `hover:text-destructive`.

### Layout
- App shell: `flex h-screen bg-background` con `<AppSidebar>` (224px fijo) + `<main className="flex-1 overflow-auto">`.
- Vista del día: lista vertical `flex flex-col gap-3`, `max-w-4xl mx-auto`, `p-6`.
- Calendario: `max-w-5xl mx-auto`, `p-6`.
- **Responsive**: el software se usa en tablets (~820px) en el aeródromo — probar a esa anchura.

---

## Convenciones de desarrollo

### Estructura de carpetas
```
src/
  app/
    (auth)/
    (dashboard)/
      page.tsx              # Calendario operacional
      [date]/page.tsx       # Vista operacional del día
      finanzas/             # Módulo de finanzas v2
  components/
    ui/                     # shadcn/ui components
    operational/            # componentes de dominio
  lib/
    actions/                # Server Actions por entidad
    finance/                # Motor P&L + checks de regresión
    export/                 # CSV, Excel, PDF
    supabase/
      client.ts             # cliente browser
      server.ts             # cliente SSR
      service.ts            # service client (salta RLS — solo para Server Actions/webhooks)
      database.types.ts     # tipos generados de DB — no editar a mano salvo extensiones de dominio
  types/
    domain.ts               # tipos de dominio TypeScript

docs/
  DESIGN_SYSTEM.md          # sistema de diseño completo
  FINANCE_V2_INTEGRATION.md # guía post-merge finanzas v2 (plantilla para futuros módulos)
  FINANCE_MODEL_V2.md       # modelo de datos finanzas v2
  reservas/                 # documentos del sistema de reservas (próximo módulo)
    MASTER_PLAN_v2.md
    TECH_APPENDIX_v2.md
    HANDOFF_PROMPT.md
    RESERVAS_MODULE_PLAN_v1.md  # plan preliminar del hermano (referencia histórica)
```

### Reglas generales
- TypeScript estricto en todo el proyecto (`strict: true`). Sin `any`.
- Usar tipos generados por Supabase CLI; extender en `src/types/domain.ts` si hace falta.
- **Server Actions** para todas las mutaciones. Route Handlers solo para webhooks externos (Stripe) y exportaciones.
- Motores de lógica de negocio **puros** (sin I/O): `pnl-engine.ts`, `availability-engine.ts`. Testear con checks `jiti` antes del PR.
- Supabase RLS activo en todas las tablas. El `service.ts` (service client) salta RLS — usarlo solo en Server Actions autenticadas o webhooks con firma verificada.
- Fechas siempre en ISO 8601, timezone `Europe/Madrid`.
- Nombres de tablas en snake_case (PostgreSQL), interfaces TypeScript en PascalCase.

### Migraciones de base de datos
- Siempre **aditivas y reversibles**: `ADD COLUMN` con `DEFAULT`, tablas nuevas, no `ALTER TYPE ADD VALUE` (no reversible).
- Incluir bloque `ROLLBACK` al final de cada migración.
- Probar en rama de Supabase (nunca prod) antes del PR.
- Regenerar `database.types.ts` después de aplicar: `supabase gen types typescript --local > src/lib/supabase/database.types.ts`.
- Timestamp del archivo: posterior a la última migración existente.

---

## Supabase — configuración

- CLI para migraciones: `supabase/migrations/`.
- Regenerar tipos: `supabase gen types typescript --local > src/lib/supabase/database.types.ts`.
- RLS habilitado en todas las tablas desde el principio.

### Variables de entorno
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # ⚠ SIN prefijo NEXT_PUBLIC_ — nunca exponer al browser
```

> La service role key salta RLS. Si se filtra al cliente (prefijo `NEXT_PUBLIC_`), cualquiera puede leer/escribir toda la base de datos. Verificar que en `.env.local` y en las variables de Vercel el nombre sea `SUPABASE_SERVICE_ROLE_KEY` (sin prefijo).

### Proyecto Supabase
El proyecto de la app (`ojngrplnuhcenulfnfps`) está en la organización del hermano. El MCP de Supabase conectado en las sesiones de Claude del hermano lo ve directamente. Ricardo necesita invitación a esa org para verlo vía MCP.

---

## Comandos útiles

```bash
# Desarrollo
npm run dev                          # inicia en localhost:3000

# Build y comprobación
npm run build
npx tsc --noEmit                     # verificación de tipos
node_modules/.bin/jiti src/lib/finance/__pnl_check.mts    # check regresión P&L
node_modules/.bin/jiti src/lib/export/__gastos_check.mts  # check regresión gastos

# Supabase
supabase start
supabase db reset
supabase gen types typescript --local > src/lib/supabase/database.types.ts

# Git / PR
git worktree list                    # ver todos los worktrees activos
gh pr create --title "..." --body "..."
git push origin --delete <rama>      # limpiar rama remota tras merge
```
