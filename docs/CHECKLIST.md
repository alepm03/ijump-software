# iJump — Checklist de Desarrollo MVP

Estado general de módulos. Cada módulo se desarrolla en su propia rama (`feature/`) y se mergea a `main` vía PR.

---

## Módulo 1 · Calendario Operacional ✅
- [x] Vista de calendario mensual
- [x] Navegación entre meses
- [x] Tarjetas de jornada con resumen (vuelos, saltos)
- [x] Crear nueva jornada con hora de inicio
- [x] Días vacíos clicables para crear jornada

---

## Módulo 2 · Vista Operacional del Día ✅
- [x] Layout vertical de vuelos (DayManifest)
- [x] Header del día con estado meteorológico y notas
- [x] Drag & drop de vuelos (reordenar)
- [x] Drag & drop de participantes entre vuelos
- [x] Sincronización Realtime (múltiples dispositivos)
- [x] Panel resumen diario (DailySummaryPanel)

---

## Módulo 3 · Gestión de Vuelos ✅
- [x] Crear vuelo
- [x] Eliminar vuelo
- [x] Editar hora estimada
- [x] Cambiar estado del vuelo
- [x] Reordenar vuelos

---

## Módulo 4 · Gestión de Participantes ✅
- [x] Añadir participante a vuelo (drawer)
- [x] Editar datos inline (nombre, teléfono, email, peso)
- [x] Asignar instructor
- [x] Cambiar estado operativo (check-in, briefing, equipado, etc.)
- [x] Mover participante entre vuelos
- [x] Eliminar participante
- [x] Package type (SOLO, HANDYCAM, VIDEO_EXTERNO, FOTOS…)
- [x] Sobrepeso (overweight fee)

---

## Módulo 5 · Sistema de Pagos ✅
- [x] Añadir pago (reserva / liquidación / suplemento)
- [x] Métodos: EFECTIVO, TARJETA, BIZUM, TRANSFERENCIA, GROUPON
- [x] Fuente de reserva (DIRECT, GROUPON, BONO, PROMO, SMARTBOX)
- [x] Editar y eliminar pagos
- [x] Totales diarios por método en panel resumen

---

## Módulo 6 · Sistema Documental — Waiver ✅
- [x] Generación de token único por participante
- [x] Página pública de firma (`/waiver/[token]`)
- [x] Waiver con contenido legal real
- [x] RGPD / Consentimiento informado
- [x] Firma táctil (canvas)
- [x] Generación de PDF y subida a Supabase Storage
- [x] QR modal para enviar enlace al cliente
- [x] Estado del documento en ParticipantRow

---

## Módulo 7 · Gestión de Instructores ✅
- [x] Página de administración de instructores (`/admin/instructores`)
- [x] Crear instructor
- [x] Activar / desactivar instructor
- [x] Dropdown de instructores en ParticipantRow

---

## Módulo 8 · Rediseño Frontend v2 ✅
- [x] Light mode completo (OKLCH, naranja corporativo)
- [x] Sidebar de navegación
- [x] Layout vertical de vuelos (sustitución de Kanban)
- [x] Adaptación de todos los componentes al nuevo tema
- [x] Skeletons de carga (loading.tsx)
- [x] Optimización de queries (JOIN, middleware)
- [ ] Auditoría a11y (WCAG AA, focus states, touch targets) — pendiente

---

## Módulo 9 · Finanzas ✅

### 9.A · Base de datos y tipos ✅
- [x] Migración: añadir `fee_per_jump` a tabla `instructors`
- [x] Migración: nueva tabla `financial_settings` (precios globales)
- [x] Migración: nueva tabla `day_expenses` (gastos y overrides por día)
- [x] Actualizar `src/lib/supabase/database.types.ts`
- [x] Añadir tipos de dominio en `src/types/domain.ts`

### 9.B · Server Actions ✅
- [x] `src/lib/actions/finance.ts`
  - [x] `getFinancialSettings()` — leer precios globales
  - [x] `updateFinancialSettings()` — editar precios globales
  - [x] `getDayFinancials(date)` — P&L completo del día
  - [x] `upsertDayExpense()` — crear/editar gasto o override
  - [x] `deleteDayExpense()` — eliminar gasto
  - [x] `getMonthFinancials(month)` — resumen mensual
  - [x] `getInstructorPayouts(month)` — desglose por instructor

### 9.C · Vista mensual `/finanzas` ✅
- [x] Entrada "Finanzas" en sidebar (`AppSidebar.tsx`)
- [x] Página `src/app/(dashboard)/finanzas/page.tsx`
- [x] Selector de mes
- [x] Tabla resumen: día / ingresos / costes / neto
- [x] Totales del mes
- [x] Panel de pagos a instructores (instructor / saltos / importe)
- [x] `src/app/(dashboard)/finanzas/loading.tsx` — skeleton

### 9.D · Vista diaria — pestaña Finanzas ✅
- [x] Añadir tab "Finanzas" en la vista del día (`/[date]`)
- [x] Desglose de ingresos (por método de pago)
- [x] Línea de gasolina (calculada + botón override)
- [x] Línea de hangar (calculada + botón override)
- [x] Desglose de instructores (por instructor: saltos × fee)
- [x] Línea de plegadores (saltos × fee)
- [x] Gastos extra libres (añadir / editar / eliminar)
- [x] Total costes y neto del día

### 9.E · Ajustes de precios (Admin) ✅
- [x] Sección de configuración financiera en `/admin`
  - [x] Precio gasolina por vuelo
  - [x] Precio hangar por día
  - [x] Fee plegador por salto
- [x] Edición del `fee_per_jump` de cada instructor en `/admin/instructores`

---

## Módulo 10 · Modo automático de costes 🔲 ← FUTURO
> Requiere que los precios estén fijados y validados en producción.
- [ ] Al crear un vuelo → registrar coste de gasolina automáticamente
- [ ] Al asignar instructor → registrar su fee automáticamente
- [ ] Al añadir participante → registrar fee de plegador automáticamente
- [ ] Panel financiero del día actualizado en tiempo real durante la operación

---

## Notas de implementación financiera

**Fórmulas de cálculo:**
- Gasolina del día = `fuelPricePerFlight × nVuelos` (anulable por override)
- Hangar del día = `hangarPricePerDay` (anulable por override)
- Fee instructor = `instructor.feePerJump` × saltos asignados ese día
- Plegadores = `packerFeePerJump × nSaltos` (todos los saltos del día)
- Gastos extra = suma de entradas libres del staff
- **Neto = Ingresos − (Gasolina + Hangar + Instructores + Plegadores + Gastos extra)**

**Tablas nuevas:**
```
financial_settings: id, fuel_price_per_flight, hangar_price_per_day, packer_fee_per_jump, updated_at
day_expenses: id, operational_day_id, type (FUEL_OVERRIDE|HANGAR_OVERRIDE|CUSTOM), description, amount, created_at
```
