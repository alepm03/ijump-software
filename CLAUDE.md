@AGENTS.md

# iJump Operational System — CLAUDE.md

## Qué es este proyecto

Sistema operacional para un centro de paracaidismo tándem. Sustituye un Excel + WhatsApp + papel por una aplicación web moderna. El núcleo del sistema NO es la gestión de clientes: es el **Manifest Operacional Diario**.

## Stack tecnológico

- **Frontend**: Next.js 16 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
- **State**: Zustand (estado local UI), TanStack Table (tablas), DnD Kit (drag & drop)
- **Backend**: Next.js Server Actions + Route Handlers (sin backend separado)
- **DB**: PostgreSQL via Supabase
- **Auth**: Supabase Auth (una cuenta admin en MVP)
- **Realtime**: Supabase Realtime (sincronización en tiempo real del manifest)
- **Storage**: Supabase Storage (PDFs, firmas, documentos)
- **Hosting**: Vercel

## Dominio — conceptos clave

### OperationalDay
Entidad central. Representa una jornada completa de saltos. Contiene vuelos, participantes, métricas y pagos. Todo gira alrededor de esto.

### Flight
Un vuelo individual dentro de una jornada. Máximo 2 participantes (tándem). Puede tener cámara externa (ocupa plaza). Dinámico: se añade, elimina, reordena en tiempo real.

### Participant
Persona individual que salta. Tiene su propio estado operativo, instructor, pago y documentación. Aunque pertenezca a una reserva grupal, opera de forma individual.

### ReservationGroup
Agrupación comercial de participantes (e.g., familia que reserva junta). El pago puede ser individual o a través de un pagador principal.

### Payment
Desacoplado del participante. Tiene método (EFECTIVO, TARJETA, BIZUM, TRANSFERENCIA, GROUPON) y etapa (RESERVA, LIQUIDACION, SUPLEMENTO).

## Enums importantes

```typescript
PackageType: SOLO | HANDYCAM | VIDEO_EXTERNO | FOTOS | HANDYCAM_FOTOS
// SOLO = sin video; FOTOS puede ser add-on independiente — confirmar con negocio

ReservationSource: DIRECT | GROUPON | BONO | PROMO | SMARTBOX

PaymentMethod: EFECTIVO | TARJETA | BIZUM | TRANSFERENCIA | GROUPON

PaymentStage: RESERVA | LIQUIDACION | SUPLEMENTO

OperationalStatus: PENDING | CHECKED_IN | WAIVER_SIGNED | BRIEFED | GEARED_UP | READY | COMPLETED | CANCELLED | NO_SHOW | WEATHER_CANCELLED

FlightStatus: SCHEDULED | BOARDING | IN_AIR | COMPLETED | DELAYED | CANCELLED
```

## Formato del Excel real (referencia de negocio)

El Excel `docs/28 SEPT.xlsx` tiene esta estructura por fila:
- N° VUELO (ej: "1 9:00") — identifica vuelo + hora
- PLAZAS — nombre del participante (header confuso, es el nombre)
- INSTRUCTOR — asignado el mismo día, puede estar vacío
- PAGO RESERVA — fuente + tier: "GROUPON", "I JUMP 60", "350 BONO"
- CÁMARA — "HC" (handycam) o vacío
- FOTOS — vacío o marcado
- TELÉFONO
- LIQUIDACION PAGO — string combinado: "65 EFECT", "190 EFECTIVO", "65 TARJETA"
- TIPO DE VIDEO
- CORREO ELECTRONICO

El resumen al final del Excel (totales diarios) debe estar disponible en tiempo real en el dashboard.

## Sistema de diseño — reglas obligatorias

Toda nueva UI debe seguir este sistema sin excepción. No usar dark mode, no usar clases zinc hardcodeadas, no usar azul sky como acento.

### Tema y color
- **Light mode únicamente** — no hay dark mode en este proyecto
- **Color space**: OKLCH vía variables CSS (`--background`, `--foreground`, `--primary`, etc.)
- **Acento de marca**: naranja corporativo — usar siempre `bg-primary`, `text-primary`, `hover:bg-primary/90`
- **Nunca** usar `bg-zinc-900`, `bg-zinc-800`, `text-white`, `bg-sky-600` ni ningún color hardcodeado de Tailwind para superficies o texto
- Usar exclusivamente tokens semánticos: `bg-background`, `bg-card`, `bg-secondary`, `text-foreground`, `text-muted-foreground`, `border-border`

### Tokens de referencia rápida
| Propósito | Token |
|-----------|-------|
| Fondo principal | `bg-background` |
| Tarjetas / superficies | `bg-card` |
| Hover / tint de marca | `bg-secondary` |
| Texto principal | `text-foreground` |
| Texto secundario | `text-muted-foreground` |
| Bordes | `border-border` |
| Acento naranja | `bg-primary` / `text-primary` |
| Texto sobre naranja | `text-primary-foreground` |
| Sidebar | `bg-sidebar` |

### Componentes y patrones
- **Badges de estado**: pill redondeado (`rounded-full`), fondo suave claro + texto de color. Ejemplo: `bg-blue-50 text-blue-600`, `bg-orange-50 text-orange-600`
- **Nav activo en sidebar**: `bg-secondary text-primary font-semibold` — nunca `border-left` como acento
- **CTAs primarios**: `bg-primary hover:bg-primary/90 text-primary-foreground`
- **Botones fantasma**: `text-muted-foreground hover:text-foreground hover:bg-secondary`
- **Modales / Sheets / Dialogs**: sin clases de color explícitas — los tokens de shadcn/ui ya aplican el tema correcto
- **Inputs en edición inline**: `bg-background border border-input rounded focus:ring-ring`
- **Destructive**: `text-destructive` / `hover:text-destructive`

### Layout
- App shell: `flex h-screen bg-background` con `<AppSidebar>` (224px) + `<main className="flex-1 overflow-auto">`
- Vista del día: lista vertical `flex flex-col gap-3`, ancho máximo `max-w-4xl mx-auto`, padding `p-6`
- Calendario: `max-w-5xl mx-auto`, padding `p-6`

### Referencia visual
El prototipo aprobado está en `docs/ijump-prototype-v2.html`. Abrirlo en el navegador para referencia visual antes de implementar nuevas pantallas.

## Convenciones de desarrollo

### Estructura de carpetas (Next.js App Router)
```
src/
  app/
    (auth)/
    (dashboard)/
      page.tsx              # Calendario operacional
      [date]/
        page.tsx            # Vista operacional del día
  components/
    ui/                     # shadcn/ui components
    operational/            # componentes de dominio (FlightCard, ParticipantRow, etc.)
    forms/
  lib/
    supabase/
      client.ts
      server.ts
      database.types.ts     # tipos generados de DB
    actions/                # Server Actions organizadas por entidad
  types/
    domain.ts               # tipos de dominio TypeScript
```

### Reglas generales
- TypeScript estricto en todo el proyecto (`strict: true`)
- Sin `any` — usar tipos generados por Supabase CLI
- Server Actions para todas las mutaciones (no API routes para CRUD básico)
- Supabase Row Level Security activo desde el inicio
- Nombres de tablas en snake_case (PostgreSQL), interfaces TypeScript en PascalCase
- Fechas siempre en ISO 8601, timezone del centro (Europe/Madrid)

### Prioridades del MVP
1. Operativa rápida — el staff no puede perder tiempo con la UI
2. Edición inline — clicks mínimos para cambiar datos
3. Persistencia histórica — ninguna jornada se pierde jamás
4. Realtime — múltiples dispositivos ven el mismo estado

### Lo que NO se hace en MVP
- CRM avanzado
- Automatización WhatsApp
- Multimedia / vídeos
- BI / reporting avanzado
- Pagos online
- App móvil cliente
- Multi-empresa / multi-avión
- Múltiples manifests

## Supabase — configuración

- Usar Supabase CLI para migraciones (`supabase/migrations/`)
- Generar tipos automáticamente: `supabase gen types typescript --local > src/lib/supabase/database.types.ts`
- RLS habilitado en todas las tablas desde el principio
- Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Estrategia de ramas (Gitflow)

La rama principal es `main`. Todo el trabajo se hace en ramas separadas que se mergean vía PR.

### Convención de nombres

| Tipo | Prefijo | Ejemplo |
|------|---------|---------|
| Nueva funcionalidad | `feature/` | `feature/operational-day-calendar` |
| Corrección de bug | `fix/` | `fix/flight-reorder-index` |
| Módulo de base de datos | `feature/db-` | `feature/db-schema-initial` |
| Hotfix urgente en producción | `hotfix/` | `hotfix/payment-calculation` |
| Refactor sin cambio funcional | `refactor/` | `refactor/participant-actions` |

### Reglas
- **Nunca** hacer commits directamente sobre `main`
- Cada rama cubre **una sola funcionalidad o fix** (granularidad de checklist item o submódulo)
- Hacer PR a `main` al terminar la rama
- Borrar la rama después del merge
- Mensajes de commit en inglés, imperativo: `Add flight reorder logic`, `Fix payment total calculation`

### Flujo habitual
```bash
# Crear rama desde main actualizado
git checkout main && git pull
git checkout -b feature/nombre-descriptivo

# Trabajar, commitear...
git add <files>
git commit -m "Add: descripción del cambio"

# Push y PR
git push -u origin feature/nombre-descriptivo
# → Abrir PR en GitHub hacia main
```

## Comandos útiles

```bash
# Desarrollo
npm run dev

# Supabase local
supabase start
supabase db reset
supabase gen types typescript --local > src/lib/supabase/database.types.ts

# Build
npm run build
npm run lint
```
