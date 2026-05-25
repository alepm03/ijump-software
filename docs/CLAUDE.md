# iJump Operational System — CLAUDE.md

## Qué es este proyecto

Sistema operacional para un centro de paracaidismo tándem. Sustituye un Excel + WhatsApp + papel por una aplicación web moderna. El núcleo del sistema NO es la gestión de clientes: es el **Manifest Operacional Diario**.

## Stack tecnológico

- **Frontend**: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
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

El Excel `28 SEPT.xlsx` tiene esta estructura por fila:
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
      types.ts              # tipos generados de DB
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
