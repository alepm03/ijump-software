# Modelo financiero v2 — iJump (as-built)

**Rama:** `feature/finance-v2` · **Migración:** `supabase/migrations/20260618000000_finance_v2.sql`
**Principio rector:** migración **aditiva y reversible**. No se pierde nada de cómo operan hoy. `payments`, `financial_settings` y `day_expenses` se conservan.

Spec de negocio completa: `02_roadmap/FINANZAS_MODELO_DATOS.md` (repo de auditoría). Este documento es la referencia *as-built* dentro del software.

---

## 1. Qué resuelve

El modelo v1 colapsa la economía del negocio: ingresos solo por método de pago (sin desglose por producto), costes en 5 buckets rígidos (el Excel real tiene 9 categorías agrupadas en Materia Prima / Personal / Generales → EBITDA), sin catálogo de precios, sin proveedor ni sociedad, sin export. v2 lo reproduce fiel al Excel y deja la base para dar cuentas a la gestoría.

## 2. Idea central: separar "lo vendido" de "lo cobrado"

- **`participant_items`** = lo vendido (líneas de venta por participante, con `product_id`, `unit_price` snapshot y `amount` calculado). El **ingreso por producto** sale de aquí, agrupado por `product.category` → reproduce el desglose del Excel (Tándem / Handycam / Cámara ext. / Fotos / OW / Reportaje).
- **`payments`** = lo cobrado (intacto: cuánto entró y por qué método/etapa). Permite ver depósito vs liquidación y descuadres.

**Regla de reconocimiento de ingreso (compatibilidad histórica):**

```
revenue(participant) = COALESCE( SUM(items.amount), SUM(payments.amount) )
```

Si el participante tiene items, manda el itemizado; si no, cae a los pagos. Los totales históricos no cambian.

## 3. Correcciones de diseño respecto a la spec (decisiones de arquitectura)

1. **Itemización solo hacia adelante — NO se hace backfill parcial de `participant_items` en históricos.** La spec sugería crear un item OW desde `participants.overweight_fee` para históricos. Eso **rompe la regla COALESCE**: un saltador antiguo con un único item OW de 45 € dejaría de contar sus pagos (p. ej. 275 €) y pasaría a valer 45 €. → Los históricos se quedan en pagos (total intacto). OW es un producto del catálogo para altas nuevas. `overweight_fee` se conserva como fallback.

2. **El P&L por producto lleva un bucket "Otros / sin desglosar".** Como los históricos no tienen items, su ingreso no se puede partir por producto. El desglose añade una línea **"Sin desglosar" = Σ pagos de participantes sin items**, para que el total del periodo cuadre con la regla COALESCE. Meses nuevos: split fiel; meses antiguos: ingreso completo sin split.

3. **Reversibilidad 100 % en el core; la extensión de enum va aislada.** Todo es aditivo y reversible salvo añadir valores a `reservation_source` (Postgres no permite quitar valores de un enum). Por eso WONDERBOX/JUMPING/FREEDOM van en una **migración aparte** (`20260618000001_extend_reservation_sources.sql`) y solo hacen falta para el KPI de mix por origen (Workstream E), no para el P&L. El bloque ROLLBACK comentado al final de la migración principal revierte limpio.

## 4. Esquema nuevo

| Tabla | Rol |
|---|---|
| `products` | Catálogo configurable. `code, name, category, base_price, vat_rate (nullable, IVA-ready), active, sort_order`. |
| `participant_items` | Líneas de venta. `participant_id, product_id, quantity, unit_price (snapshot), vat_rate (snapshot), amount (GENERATED = qty*unit_price)`. |
| `expense_categories` | 9 categorías del Excel con `group_type` (COSTES_DIRECTOS / COMISIONES / PERSONAL / GENERALES — ver §11) y `rate_basis` (PER_FLIGHT / PER_JUMP / FIXED_PER_DAY / NULL) para el cálculo automático y el EBITDA. |
| `expenses` | Generaliza `day_expenses`. Añade `supplier` (PROVEEDOR), `sociedad`, `incurred_on`, `vat_rate`, y `operational_day_id` **nullable** → permite gastos fijos mensuales (seguro, gestoría) no atados a una jornada. |

Enums nuevos: `product_category`, `expense_group`, `rate_basis`. RLS: `authenticated full access` en las 4 tablas (misma postura que el esquema base; a endurecer en el security pass).

## 5. Cálculo de coste por categoría (generaliza el override actual)

Para una jornada y categoría:

```
coste(día, cat) =
  IF existe expenses(día, cat):          SUM(expenses.amount)        -- override / valor real
  ELIF cat.rate_basis = PER_FLIGHT:      cat.default_rate * nº_vuelos
  ELIF cat.rate_basis = PER_JUMP:        cat.default_rate * nº_saltos_completados
  ELIF cat.rate_basis = FIXED_PER_DAY:   cat.default_rate
  ELIF cat.rate_basis = FIXED_PER_MONTH: 0  (se aplica una vez por mes, fuera del bucle de jornadas — ver §12)
  ELSE 0
INSTRUCTORES (especial): Σ por instructor (instructors.fee_per_jump * saltos_de_ese_instructor)
                         + ajustes manuales (expenses en categoría INSTRUCTORES), aditivos.
```

Generaliza exactamente el patrón fuel/hangar/packer + override de v1: `COMBUSTIBLE`=fuel (PER_FLIGHT), `TASAS_AERODROMO`=hangar (FIXED_PER_DAY), `PLEGADOS`=packer (PER_JUMP). Los `default_rate` se copian desde `financial_settings` en la migración. "Saltos completados" = participantes cuyo `operational_status` NO está en (CANCELLED, NO_SHOW, WEATHER_CANCELLED) — igual que hoy.

## 6. P&L (réplica del "PRESUPUESTO" del Excel)

```
INGRESOS  (por product_category)  + "Sin desglosar" (pagos de históricos)
GASTOS  (taxonomía v2.1 — ver §11)
  COSTES_DIRECTOS = Σ(Vuelos, Combustible, Plegados, Edición)
  COMISIONES      = Σ(Comisión Groupon manual  +  comisión auto por canal)
  PERSONAL        = Σ(Instructores)
  GENERALES       = Σ(Equipos, Tasas aeródromo, Generales)
EBITDA = INGRESOS − GASTOS   (+ margen %)
```

Vistas: día (reestructurada), semana (ISO lunes-domingo, nueva), mes (reestructurada), **año `/finanzas/[year]` + YTD (nuevo)**, comparativa mes-a-mes / año-a-año.

## 7. Migración: pasos

1. Enums + tablas nuevas + RLS + trigger `updated_at` (reutiliza `handle_updated_at()`).
2. Semilla de `expense_categories` (9 + mapeo a grupos EBITDA). `default_rate` ← `financial_settings`.
3. `day_expenses` → `expenses`: FUEL_OVERRIDE→COMBUSTIBLE, HANGAR_OVERRIDE→TASAS_AERODROMO, CUSTOM→GENERALES (description preservada, `incurred_on` desde la jornada). Originales intactos.
4. Semilla de `products` (precios **provisionales** de la KB; split base/cámara es asunción pendiente de Q1-Q5; editable y snapshotteado por línea).
5. `reservation_source` += WONDERBOX/JUMPING/FREEDOM (migración aparte, no reversible).
6. **NO** se backfillean `participant_items` (forward-only).
7. Rollback: bloque comentado al final de la migración principal (drop de tablas/enums nuevos; `financial_settings` y `day_expenses` siguen ahí).

## 8. IVA-ready

`vat_rate` nullable ya está en `products`, `participant_items` y `expenses`. Al confirmar IVA: poblar tarifas y el export añade columnas base imponible / IVA / total. Sin cambio de esquema.

## 9. Datos pendientes (solo bloquean el sembrado, no el esquema)

Lista de precios (Q1-7), comisiones de plataformas (Q8-9), tarifas de coste reales (Q10-17), IVA y sociedades (Q18-20) — ver `02_roadmap/PREGUNTAS_NEGOCIO_FINANZAS.md`. El esquema ya está; se siembra/afina al recibir respuestas.

## 10. Verificación (no se marca nada "hecho" sin prueba)

- Migración aplicada en la BD real (branch Supabase del proyecto), **datos existentes intactos**.
- P&L en pantalla cuadrado contra un mes real del Excel (objetivo de control: Oct 2024 → ingresos 9.840 €, EBITDA 861 €).
- Export (Excel/CSV/PDF) contrastado contra el P&L en pantalla.
- `npm run build` + `npx tsc --noEmit` limpios. Responsive en tablet (~820px).

## 11. Reclasificación de gastos + comisiones por canal (v2.1)

Migración `20260622000000_finance_expense_model.sql`. Aditiva y reversible (bloque ROLLBACK).
Mueve costes entre grupos pero **no cambia el coste total ni el EBITDA de ningún periodo**
(invariante verificada en `__pnl_check.mts`).

### 11.1 Taxonomía corregida

El seed v2 metía casi todo en `MATERIA_PRIMA`, lo que distorsionaba el margen bruto por
salto. Nueva taxonomía (4 grupos). Para hacerla ajustable y reversible para siempre,
`expense_categories.group_type` pasa de **ENUM Postgres a TEXT + CHECK** (`ALTER TYPE ADD
VALUE` no es reversible y la disciplina de migración lo prohíbe).

| group_type | Partidas | Razón |
|---|---|---|
| `COSTES_DIRECTOS` | VUELOS, COMBUSTIBLE, PLEGADOS, EDICION | Varían por vuelo/salto/extra. EDICION es coste directo del vídeo, ya no "materia prima". |
| `COMISIONES` | COMISION_GROUPON + comisión auto por canal | Coste comercial (% de venta). |
| `PERSONAL` | INSTRUCTORES | — |
| `GENERALES` | EQUIPOS, TASAS_AERODROMO, GENERALES | Overhead/fijo. EQUIPOS = amortización/mantenimiento; TASAS = fijo/día. |

### 11.2 Canales de venta + comisiones (tabla `sale_channels`)

Registro de canales de venta con comisión ajustable. Dos tipos (`channel_kind`):

| channel_kind | Canales | Comisión |
|---|---|---|
| `DIRECT` | Reserva directa, Bono regalo, Promoción | 0% (venta directa de iJump) |
| `PLATFORM` | Groupon, Smartbox, Wonder Box, Jumping, Freedom | % por plataforma (NULL = pendiente Raúl, S21) |

Columnas: `code, name, channel_kind CHECK(DIRECT|PLATFORM), commission_pct NUMERIC(5,2) CHECK
0..100 (NULL), active, notes, sort_order`. RLS `authenticated full access` (dato de app
normal). Ajustable desde **/admin** (`SaleChannelsForm`: edita el % de las plataformas; los
directos se muestran como 0% sin editar).

**Cálculo en el motor** (`pnl-engine.ts`, puro): por participante,
`comisión = Σ participantRevenue(p) × pct(p.reservation_group.source) / 100`, sobre la misma
base que `revenueTotal`. El canal se resuelve desde `reservation_groups.source` →
`sale_channels.code` (coincidencia directa: DIRECT, BONO, PROMO, GROUPON, SMARTBOX → 0% los
directos). Entra como línea sintética `COMISION_CANAL` en el grupo `COMISIONES`.

- Con `pct = NULL`/`0` (estado actual de las plataformas) la comisión auto es **0** → totales
  históricos intactos.
- **Una sola fuente de verdad:** si el periodo tiene filas manuales de `COMISION_GROUPON`, la
  línea auto se **suprime** (manual gana, como el override manual de la fórmula en §5). Evita
  el doble conteo cuando se fije la tarifa.
- Sin override por participante en v2.1 (el % por canal cubre la necesidad). El campo
  `reservation_group.source` ya existe; **no se acopla** con el módulo de reservas. `sale_channels`
  es una tabla de config independiente del enum `ReservationSource` que reservas reutilizará;
  Wonder Box/Jumping/Freedom aún no tienen valor en el enum (lo extenderá reservas) → quedan
  inalcanzables por el motor hasta entonces, sin afectar nada.

### 11.3 Decisiones de negocio pendientes (🔵 Raúl) — ver `02_roadmap/PREGUNTAS_NEGOCIO_FINANZAS.md`

- ¿`VUELOS` es solo combustible (convendría renombrarlo) o incluye alquiler de avión? Riesgo de
  solape con la partida `COMBUSTIBLE` (doble conteo). + ¿sueldo del piloto como partida propia?
- ¿`EQUIPOS` es alquiler de paracaídas, compra (amortización), o ambos? ¿Importe relevante?
- Tarifas reales de comisión por plataforma (Groupon/Smartbox/Wonder Box/Jumping/Freedom).
- Promociones concretas (grupo/pareja/puntual) e importes.
- Reconciliación `ReservationSource` ↔ `sale_channels` (extender enum en la sesión de reservas).

> Nota de entorno: en la sesión de desarrollo no había Supabase CLI/Docker local ni acceso al
> proyecto (org del hermano), así que `database.types.ts` se editó a mano. **Tras aplicar la
> migración en una rama Supabase, regenerar los tipos con el CLI** y revisar `/admin` y
> `/finanzas` a ~820px.

## 12. Costes fijos mensuales (v2.2) — `FIXED_PER_MONTH`

Migración `20260630000000_finance_fixed_monthly.sql`. Corrige un bug de modelado: el motor
acumula coste por jornada y lo suma; con `FIXED_PER_DAY` un coste mensual (renta del aeródromo,
cuota del préstamo, seguros, software) se cobraba **una vez por jornada operativa**, así que un
mes con 5 jornadas facturaba la renta de 1.040 € como 5 × 1.040 = 5.200 €.

### 12.1 Qué cambia
- `rate_basis` deja de ser un ENUM de Postgres y pasa a **TEXT + CHECK** (igual que se hizo con
  `group_type` en v2.1), porque `ALTER TYPE ADD VALUE` no es reversible. Valores permitidos:
  `PER_FLIGHT`, `PER_JUMP`, `FIXED_PER_DAY`, `FIXED_PER_MONTH`.
- Se reclasifican a `FIXED_PER_MONTH`: `TASAS_AERODROMO`, `SWOOPWARE`, `CUOTA_PRESTAMO_AVION`,
  `SEGURO_AVION`.

### 12.2 Cómo lo aplica el motor
`buildPnl` recibe `monthsInPeriod` y carga los `FIXED_PER_MONTH` **una sola vez tras el bucle de
jornadas**, multiplicando `default_rate × monthsInPeriod`:

| Vista | `monthsInPeriod` | Motivo |
|---|---|---|
| Día | 0 | El overhead mensual no se atribuye a una jornada suelta (prorratear sería arbitrario). |
| Semana | 0 | Igual: una semana es un tramo submensual. |
| Mes | 1 | Se cobra una vez. |
| Año / YTD | nº de meses calendario del rango | p. ej. año completo = 12, YTD a junio = 6. |

Consecuencia esperada: **el total mensual NO es la suma de los totales diarios** (el mes carga el
overhead fijo que ninguna jornada individual carga). Una fila de gasto manual
(`operational_day_id IS NULL`) para la misma categoría **anula** la tarifa automática (gana el
dato real, sin doble conteo).

Limitación documentada: la tarifa automática × meses asume que el coste estuvo activo todos los
meses del rango. Para costes que empiezan/terminan a mitad de periodo (p. ej. el préstamo del
avión desde jun-2026), registrar **filas de gasto mensuales reales** (anulan la tarifa automática).

### 12.3 UI
- `/admin`: las categorías `FIXED_PER_MONTH` muestran "Tarifa por mes".
- `/finanzas`: el desglose de gastos oculta las líneas a 0 € (consistente con la sección de
  ingresos), así las categorías aún pendientes de importe no generan ruido. Siguen editables en
  `/admin`.
- Manifiesto: nuevo toggle "Marcar back-to-back" en el menú ⋮ de cada vuelo (`flights.is_back_to_back`),
  con badge visual. Activa el coste condicional de `EQUIPOS` (25 €/salto en vuelos back-to-back).

### 12.4 Decisiones cerradas (Raúl, jun-2026)
- **`VUELOS` archivado** (`active = false`). El "coste por vuelo" era el alquiler del avión, que ya
  no existe: el avión es propio (préstamo). El combustible es `COMBUSTIBLE` (PER_FLIGHT) y el coste
  del avión es la cuota del préstamo. `VUELOS` no tiene significado y solo arriesgaba doble conteo.
- **El coste del avión es el préstamo** (150.000 € / 7 años, desde jun-2026), cuota mensual que ya
  **incluye intereses**. Se modela como `CUOTA_PRESTAMO_AVION` (FIXED_PER_MONTH): aparece mensual en
  la vista de mes y **×12 en la vista anual** (donde Raúl quiere verlo). No se construye tabla de
  amortización (principal/interés) a propósito: la cuota real ya es el coste de caja.
- **Costes por salto sobre saltos no cancelados** (corrección de redacción, jul-2026: la versión
  anterior de este punto afirmaba que el motor solo contaba saltos en estado "Completado", pero
  nunca fue así). El criterio real e intencionado del motor es: cuenta como salto todo participante
  cuyo estado NO sea CANCELLED / NO_SHOW / WEATHER_CANCELLED (instructores, plegados, edición,
  cámara, equipos). Es decir, un salto "Pendiente" o "Embarcado" ya carga sus costes; solo la
  cancelación los quita. Decisión revalidada por Alejandro en jul-2026.

### 12.5 Pendientes contables (🔵 Raúl)
- Cuota real mensual del préstamo del avión (importe exacto del banco). Hoy `CUOTA_PRESTAMO_AVION` = 0.
- Amortización de los 2 paracaídas comprados (ligados a la compra del avión).
- Seguro del avión: ¿separado del bundle del aeródromo? Hoy `SEGURO_AVION` = 0.
- Swoopware: importe exacto en EUR (~30 USD/mes). Hoy = 0.
- El +200 €/mes de aplazamiento (may–dic 2026): financiación temporal, no coste recurrente; si se
  modela, línea aparte acotada en el tiempo, nunca mezclada en el bundle de 1.040 €.
- IVA: club deportivo exento por ahora; revisar al cambiar de régimen.

## 13. Consistencia manifest ↔ finanzas (v2.3, jul-2026)

Reglas cerradas por Alejandro para que el manifest (caja) y finanzas (devengo) no se contradigan:

- **Vuelos cancelados no cargan costes PER_FLIGHT** (combustible, piloto) ni cuentan en el KPI
  "Vuelos" del manifest: un vuelo `status = CANCELLED` nunca despegó. Sus ocupantes fueron
  reubicados por `cancelFlight` (regla zero-orphans), así que los números por participante no
  dependen del vuelo cancelado.
- **Ingreso de participantes no voladores (CANCELLED / NO_SHOW / WEATHER_CANCELLED) = solo sus
  pagos.** El motor ignora sus `participant_items` aunque existan (p. ej. un OW manual que
  sobrevivió al `clearAutoParticipantItems`): la venta no ocurrió, pero el dinero cobrado es no
  reembolsable (waiver) y sigue contando, bajo SIN_DESGLOSE.
- **Suplemento OW idempotente**: `addOverweightSupplement` rechaza un segundo item OW para el
  mismo participante — un doble click en el botón "+ OW" del manifest ya no duplica ingreso.
- **El KPI del manifest se llama "Cobrado"** (antes "Ingresos") y suma los pagos de TODOS los
  participantes del día, cancelados incluidos: si el dinero entró, está cobrado — coherente con el
  cierre de caja de tesorería. "Ingresos" queda reservado para finanzas (devengo por items).
  Implementado en `computeManifestSummary` (`lib/manifest-summary.ts`), que es quien alimenta el
  header del día (`getDailySummary` en payment.ts es código v1 sin llamadores).
- **Depósitos retenidos (v2.3, reagendamiento)**: los pagos de leads cancelados definitivamente
  **sin vuelo asignado** (`lead_status = CANCELLED`, `flight_id IS NULL`) no pertenecen a ningún
  día operativo y antes desaparecían del P&L. Ahora entran como línea sintética de ingreso
  "Depósitos retenidos" (`DEPOSITO_RETENIDO`), atribuida a la **fecha del pago** (decisión
  jul-2026, coherente con caja). Los cancelados que conservan vuelo ya cuentan en su día por la
  regla de pagos — el filtro `flight_id IS NULL` evita el doble conteo. Ver
  `fetchRetainedDeposits` en finance.ts.
- **Cancelar un vuelo** ofrece tres vías: mover a otro vuelo (lo de siempre), **reagendar**
  (los participantes vuelven a `/reservas` → pestaña "Reagendar" como RESCHEDULE_NEEDED, circuito
  meteo por vuelo) o **cancelación definitiva** (participantes CANCELLED que conservan su
  `flight_id`, así el depósito sigue contando en ese día).
