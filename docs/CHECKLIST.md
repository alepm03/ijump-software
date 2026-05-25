# iJump — Checklist de Desarrollo

> Marca cada item con [x] cuando esté completado.
> El desarrollo sigue un orden Backend-first: schema → datos → lógica → UI.

---

## MÓDULO 0 — Setup del Proyecto

- [ ] Crear repositorio GitHub (`ijump-software`)
- [ ] Inicializar proyecto Next.js 14 con TypeScript y App Router
  ```bash
  npx create-next-app@latest ijump-software --typescript --tailwind --app --src-dir
  ```
- [ ] Configurar Tailwind CSS
- [ ] Instalar y configurar shadcn/ui
  ```bash
  npx shadcn-ui@latest init
  ```
- [ ] Instalar dependencias clave:
  - `@supabase/supabase-js`, `@supabase/ssr`
  - `zustand`
  - `@tanstack/react-table`
  - `@dnd-kit/core`, `@dnd-kit/sortable`
  - `react-hook-form`, `zod`
  - `date-fns`
- [ ] Crear proyecto en Supabase (cloud)
- [ ] Instalar Supabase CLI y configurar localmente
- [ ] Configurar variables de entorno (`.env.local`)
- [ ] Configurar proyecto en Vercel y conectar repositorio
- [ ] Configurar ESLint + Prettier
- [ ] Primer deploy vacío a Vercel funcionando

---

## MÓDULO 1 — Base de Datos (Schema PostgreSQL)

> Crítico: definir bien el schema antes de tocar UI.

- [ ] Diseñar y crear migración: tabla `operational_days`
  - id, date (unique), weather_status, notes, created_at, updated_at
- [ ] Diseñar y crear migración: tabla `instructors`
  - id, name, active, created_at
- [ ] Diseñar y crear migración: tabla `reservation_groups`
  - id, payer_name, source (enum), notes, created_at
- [ ] Diseñar y crear migración: tabla `flights`
  - id, operational_day_id (FK), flight_number, estimated_departure_time, actual_departure_time, status (enum), order_index, created_at
- [ ] Diseñar y crear migración: tabla `participants`
  - id, reservation_group_id (FK nullable), flight_id (FK nullable), full_name, phone, email, package_type (enum), media_package (enum), weight, overweight_fee, operational_status (enum), assigned_instructor_id (FK nullable), waiver_signed, check_in_completed, geared_up, notes, created_at, updated_at
- [ ] Diseñar y crear migración: tabla `payments`
  - id, participant_id (FK), amount, method (enum), stage (enum), notes, created_at
- [ ] Diseñar y crear migración: tabla `waivers`
  - id, participant_id (FK), signed_at, pdf_url, signature_url, accepted
- [ ] Crear todos los enums PostgreSQL:
  - `flight_status`, `operational_status`, `package_type`, `payment_method`, `payment_stage`, `reservation_source`
- [ ] Configurar Row Level Security en todas las tablas
- [ ] Generar tipos TypeScript desde Supabase CLI
- [ ] Revisar relaciones, índices y constraints

---

## MÓDULO 2 — Autenticación

- [ ] Configurar Supabase Auth (email/password)
- [ ] Crear middleware Next.js para proteger rutas
- [ ] Página de login (`/login`)
- [ ] Server Action de login / logout
- [ ] Crear cuenta admin inicial en Supabase
- [ ] Redireccionamiento automático: no autenticado → `/login`
- [ ] Redireccionamiento post-login → calendario (`/`)

---

## MÓDULO 3 — Capa de Datos (Server Actions + tipos)

> Construir antes de la UI. Es el contrato entre DB y frontend.

- [ ] Definir tipos de dominio TypeScript en `src/types/domain.ts`
- [ ] Configurar cliente Supabase para Server Components y Client Components
- [ ] Server Actions — `OperationalDay`:
  - [ ] `getOperationalDays()` — listado paginado
  - [ ] `getOperationalDay(date)` — jornada con vuelos y participantes
  - [ ] `createOperationalDay(date)`
  - [ ] `updateOperationalDay(id, data)`
- [ ] Server Actions — `Flight`:
  - [ ] `createFlight(dayId, data)`
  - [ ] `updateFlight(id, data)`
  - [ ] `deleteFlight(id)`
  - [ ] `reorderFlights(dayId, orderedIds)`
- [ ] Server Actions — `Participant`:
  - [ ] `createParticipant(flightId, data)`
  - [ ] `updateParticipant(id, data)`
  - [ ] `moveParticipant(id, newFlightId)`
  - [ ] `updateOperationalStatus(id, status)`
  - [ ] `deleteParticipant(id)`
- [ ] Server Actions — `Payment`:
  - [ ] `createPayment(participantId, data)`
  - [ ] `updatePayment(id, data)`
  - [ ] `deletePayment(id)`
  - [ ] `getDailySummary(dayId)` — totales del día
- [ ] Server Actions — `Instructor`:
  - [ ] `getInstructors()`
  - [ ] `createInstructor(data)`
  - [ ] `toggleInstructorActive(id)`

---

## MÓDULO 4 — Calendario Operacional

- [ ] Página principal `/` — lista de jornadas operacionales
- [ ] Componente `DayCard` — resumen de una jornada (fecha, vuelos, saltos)
- [ ] Botón "Nueva Jornada" con selector de fecha
- [ ] Navegación por mes/semana
- [ ] Indicadores visuales: jornadas con datos vs vacías
- [ ] Link a jornada → `/2024-09-28` (slug por fecha)

---

## MÓDULO 5 — Vista Operacional Principal (el manifest)

> Este es el módulo más importante. Es el corazón del sistema.

### 5.1 — Estructura base
- [ ] Página `/[date]` — carga la jornada completa
- [ ] Header de jornada: fecha, estado meteorológico, notas, métricas rápidas
- [ ] Layout de vuelos en columnas o tarjetas verticales

### 5.2 — FlightCard
- [ ] Componente `FlightCard`: número de vuelo, hora, estado, lista de participantes
- [ ] Edición inline de hora del vuelo
- [ ] Cambio de estado del vuelo (dropdown)
- [ ] Botón añadir vuelo
- [ ] Botón eliminar vuelo (con confirmación)

### 5.3 — ParticipantRow
- [ ] Componente `ParticipantRow` dentro de FlightCard
- [ ] Campos editables inline: nombre, teléfono, email, peso
- [ ] Selector de instructor (dropdown con instructores activos)
- [ ] Selector de package type y media package
- [ ] Badge de estado operativo con cambio rápido
- [ ] Indicadores visuales: waiver firmado, check-in, equipado
- [ ] Notas rápidas inline
- [ ] Botón eliminar participante

### 5.4 — Añadir participantes
- [ ] Modal/drawer "Añadir participante" a un vuelo
- [ ] Form: nombre, teléfono, email, fuente de reserva, package, peso
- [ ] Opción de crear ReservationGroup o añadir a uno existente

### 5.5 — Drag & Drop
- [ ] Reordenar vuelos (drag flight cards)
- [ ] Mover participante entre vuelos (drag participant row)
- [ ] Persistencia inmediata al soltar

### 5.6 — Realtime
- [ ] Suscripción Supabase Realtime en la vista operacional
- [ ] Actualización automática al cambiar datos desde otro dispositivo
- [ ] Indicador visual de conexión realtime

### 5.7 — Panel de resumen diario
- [ ] Totales en tiempo real: vuelos, saltos, por fuente, HC extras, OW
- [ ] Ingresos totales del día
- [ ] Desglose por método de pago

---

## MÓDULO 6 — Sistema de Pagos

- [ ] Vista de pagos por participante (inline en ParticipantRow o modal)
- [ ] Form de pago: importe, método, etapa
- [ ] Edición y eliminación de pagos
- [ ] Cálculo automático: total reserva, liquidación pendiente, suplementos
- [ ] Indicador visual: pagado completo / pendiente / parcial
- [ ] Resumen financiero del día en el panel

---

## MÓDULO 7 — Documentación y Waivers

- [ ] Configurar Supabase Storage bucket para documentos
- [ ] Vista de estado documental por participante
- [ ] Firma táctil (canvas) integrada en formulario waiver
- [ ] Generación PDF del waiver con datos del participante y firma
- [ ] Subida del PDF a Supabase Storage
- [ ] Registro del waiver en tabla `waivers`
- [ ] Indicador visual "Waiver firmado" en ParticipantRow
- [ ] Acceso al PDF firmado desde el historial

---

## MÓDULO 8 — Gestión de Instructores

- [ ] Página de administración `/admin/instructors`
- [ ] Listado de instructores activos/inactivos
- [ ] Formulario crear instructor
- [ ] Toggle activo/inactivo
- [ ] Los instructores inactivos no aparecen en dropdowns operacionales

---

## MÓDULO 9 — Pulido y QA

- [ ] Responsive básico (tablet para uso en mostrador)
- [ ] Estados de carga (skeletons) en todas las vistas
- [ ] Manejo de errores con toast notifications (sonner o shadcn/ui)
- [ ] Validaciones de formularios con Zod
- [ ] Test manual del flujo completo: crear jornada → añadir vuelos → añadir participantes → asignar instructores → cambiar estados → cerrar jornada
- [ ] Test de persistencia histórica: abrir jornada del pasado
- [ ] Test realtime: dos pestañas abiertas, cambio en una → actualiza en la otra
- [ ] Optimistic updates para edición inline (sin esperar respuesta servidor)

---

## MÓDULO 10 — Deploy y Puesta en Producción

- [ ] Variables de entorno en Vercel (producción)
- [ ] Supabase producción: aplicar todas las migraciones
- [ ] RLS revisado en producción
- [ ] Dominio personalizado (si aplica)
- [ ] Backup automático en Supabase activado
- [ ] Test completo en producción con datos reales
- [ ] Documentar acceso para el operador

---

## Backlog v1.5 (post-MVP)

- [ ] Múltiples usuarios con roles
- [ ] Filtros avanzados en el manifest
- [ ] Snapshots de jornada (estado sellado)
- [ ] Métricas y estadísticas avanzadas
- [ ] Exportación a PDF del manifest diario

---

## Notas importantes

- **Siempre schema-first**: no escribir UI hasta tener el schema de DB aprobado
- **Supabase tipos**: regenerar tipos tras cada migración
- **RLS desde el inicio**: no añadirlo como afterthought
- **El manifest es la pantalla más usada**: priorizar su UX y rendimiento
- **Confirmar con negocio**: PackageType (¿FOTOS es add-on?), tiers de precio de reserva directa
