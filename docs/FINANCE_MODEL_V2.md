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
