# Modelo de datos financiero v2 — iJump (spec de implementación)

**Autor:** co-CTO (Opus) · **Estado:** diseño, pendiente de lista de precios real para sembrar datos.
**Principio rector:** migración **aditiva y reversible**. No se pierde nada de cómo operan hoy. `payments` se conserva intacto.

Esta spec se copiará a `ijump-software/docs/` en la rama `feature/finance-v2` al implementar.

---

## 1. Problema que resuelve

El modelo actual colapsa la economía del negocio:
- Ingresos: solo total + método de pago. No hay ingreso **por producto**.
- Costes: 5 buckets rígidos (fuel/hangar/instructor/packer/custom). El Excel real tiene **9 categorías** agrupadas en Materia Prima / Personal / Generales → EBITDA.
- Sin catálogo de precios (todo a mano). Sin proveedor ni sociedad. Sin export.

Decisión de producto: **fiel al Excel + export + catálogo configurable + IVA-ready**.

---

## 2. Concepto central: separar "lo vendido" de "lo cobrado"

Hoy `payments` mezcla ambos. Un pago de 235 € no dice si fue 175 base + 60 HC. Por eso introducimos **line items de venta** (`participant_items`) separados de los **cobros** (`payments`, que se mantiene):

- **Ingreso por producto** = suma de `participant_items` agrupada por `product.category`. Reproduce el desglose del Excel (Tándem / HC / Cámara Ext. / OW / Reportaje).
- **Cobro** = `payments` (cuánto entró y por qué método/etapa).
- **Conciliación** (bonus, casi gratis): cargado (items) vs cobrado (payments) = **saldo pendiente** por participante. Útil para "quién debe la liquidación".

**Compatibilidad histórica:** los participantes antiguos no tienen items. Regla de reconocimiento de ingreso:
```
revenue(participant) = COALESCE( SUM(items.amount), SUM(payments.amount) )
```
Es decir: si hay items, manda el itemizado; si no, cae a los pagos. Así los totales históricos no cambian y el desglose por producto funciona de aquí en adelante.

---

## 3. Esquema nuevo

### 3.1 Catálogo de productos

```sql
CREATE TYPE product_category AS ENUM (
  'TANDEM_BASE', 'CAMERA_HANDYCAM', 'CAMERA_EXTERNAL',
  'PHOTOS', 'OVERWEIGHT', 'GROUND_REPORT', 'OTHER'
);

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,        -- 'TANDEM_HC','VIDEO_EXT','OW','FOTOS','REPORTAJE'...
  name        TEXT NOT NULL,
  category    product_category NOT NULL,
  base_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_rate    NUMERIC(5,2),                -- NULL hasta confirmar IVA (IVA-ready)
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

**Precio según origen:** la KB confirma que directo (paquete completo 275/390) y Groupon (bono base + upsells en sitio HC 60/70/85, fotos 20) tienen economías distintas. En vez de una tabla de precios por plataforma (rígida, y HC tiene 3 precios sin patrón claro — ver Q3 del cuestionario), usamos **snapshot de precio en la línea**: `participant_items.unit_price` se rellena por defecto desde `products.base_price` pero es **editable**. Así cubrimos cualquier variación sin sobre-modelar, y el histórico no cambia si luego se cambia el catálogo. (Si más adelante los datos justifican una lista de precios por plataforma, se añade `product_prices(product_id, source, price)` sin romper nada.)

### 3.2 Líneas de venta

```sql
CREATE TABLE participant_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price     NUMERIC(10,2) NOT NULL,   -- snapshot en el momento de la venta
  vat_rate       NUMERIC(5,2),             -- snapshot, IVA-ready
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
-- amount = quantity * unit_price (calculado en app o columna GENERATED)
CREATE INDEX ON participant_items(participant_id);
```

### 3.3 Categorías de coste

```sql
CREATE TYPE expense_group AS ENUM ('MATERIA_PRIMA','PERSONAL','GENERALES');
CREATE TYPE rate_basis   AS ENUM ('PER_FLIGHT','PER_JUMP','FIXED_PER_DAY');

CREATE TABLE expense_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  group_type   expense_group NOT NULL,
  default_rate NUMERIC(10,2),     -- para categorías auto-calculadas
  rate_basis   rate_basis,        -- NULL = categoría puramente manual
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true
);
```

Semillas (mapeo Excel → grupos EBITDA):

| code | name | group_type | rate_basis | default_rate |
|---|---|---|---|---|
| `VUELOS` | Vuelos (avión) | MATERIA_PRIMA | NULL (manual) | — |
| `COMBUSTIBLE` | Combustible | MATERIA_PRIMA | PER_FLIGHT | (=fuel actual) |
| `EQUIPOS` | Equipos | MATERIA_PRIMA | NULL | — |
| `PLEGADOS` | Plegados | MATERIA_PRIMA | PER_JUMP | (=packer actual) |
| `EDICION` | Edición vídeo | MATERIA_PRIMA | NULL | — |
| `COMISION_GROUPON` | Comisión Groupon | MATERIA_PRIMA | NULL | — (auto futuro, ver Q9) |
| `TASAS_AERODROMO` | Tasas aeródromo | MATERIA_PRIMA | FIXED_PER_DAY | (=hangar actual) |
| `INSTRUCTORES` | Instructores | PERSONAL | (especial: por instructor) | — |
| `GENERALES` | Gastos generales | GENERALES | NULL | — |

### 3.4 Gastos

```sql
CREATE TABLE expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  operational_day_id  UUID REFERENCES operational_days(id) ON DELETE CASCADE,  -- NULL = gasto fijo no atado a jornada
  incurred_on         DATE NOT NULL,
  description         TEXT,
  supplier            TEXT,        -- PROVEEDOR
  sociedad            TEXT,        -- SOCIEDAD
  amount              NUMERIC(10,2) NOT NULL,
  vat_rate            NUMERIC(5,2),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON expenses(operational_day_id);
CREATE INDEX ON expenses(incurred_on);
```

`operational_day_id` nullable habilita **gastos fijos mensuales** (seguro, gestoría) que el modelo actual no soporta.

---

## 4. Cálculo de coste por categoría (generaliza el override actual)

Para una jornada y categoría:
```
coste(día, cat) =
  IF existe expenses(día, cat):  SUM(expenses.amount)            -- valor real/override manual
  ELIF cat.rate_basis = PER_FLIGHT:  cat.default_rate * nº_vuelos
  ELIF cat.rate_basis = PER_JUMP:    cat.default_rate * nº_saltos_completados
  ELIF cat.rate_basis = FIXED_PER_DAY: cat.default_rate
  ELSE 0
INSTRUCTORES: SUM por instructor (instructors.fee_per_jump * saltos_de_ese_instructor)
```
Esto **generaliza exactamente** el patrón fuel/hangar/packer + override que ya existe hoy, a todas las categorías. Cero pérdida de funcionalidad, y ahora con proveedor/sociedad para contabilidad.

"Saltos completados" = participantes cuyo `operational_status` NO está en (CANCELLED, NO_SHOW, WEATHER_CANCELLED), igual que hoy.

---

## 5. P&L (replica del "PRESUPUESTO" del Excel)

```
INGRESOS  (por product_category)
  Tándem base / Handycam / Cámara externa / Fotos / OW / Reportaje
GASTOS
  MATERIA PRIMA = Σ(Vuelos, Combustible, Equipos, Plegados, Edición, Comisión Groupon, Tasas)
  PERSONAL      = Σ(Instructores)
  GENERALES     = Σ(Generales)
EBITDA = INGRESOS − GASTOS         (+ margen %)
```
Vistas: día (ya existe, se reestructura), mes (se reestructura), **año `/finanzas/[year]` + YTD (nuevo)**, comparativa mes-a-mes / año-a-año.

---

## 6. Migración (additive, reversible)

1. Crear enums, tablas nuevas (products, participant_items, expense_categories, expenses) y semillas de `expense_categories`.
2. **`financial_settings` → `expense_categories.default_rate`**: fuel→COMBUSTIBLE, hangar→TASAS_AERODROMO, packer→PLEGADOS. Conservar `financial_settings` como deprecado hasta verificar (no borrar).
3. **`day_expenses` → `expenses`**: `FUEL_OVERRIDE`→categoría COMBUSTIBLE, `HANGAR_OVERRIDE`→TASAS_AERODROMO, `CUSTOM`→GENERALES (description preservada). `operational_day_id` e `incurred_on` desde la jornada.
4. **`participants.overweight_fee > 0`** (hoy nunca se suma a ingresos): crear item OW por ese importe. Mantener la columna como fallback hasta verificar.
5. Enum de origen de reserva: añadir `WONDERBOX`, `JUMPING`, `FREEDOM` (la KB los menciona; hoy faltan).
6. Sembrar `products` con lo confirmado por KB (Tándem+HC 275, Tándem+Vídeo 390, OW 45, Fotos 20, Handycam-upsell 60/70/85, Reportaje [pendiente precio]). Ajustar al recibir la lista de precios real.
7. Down migration: drop de tablas/enums nuevos; `financial_settings` y `day_expenses` siguen existiendo, así que el rollback es limpio.

**RLS:** replicar la política de las tablas existentes en `products`, `participant_items`, `expense_categories`, `expenses` (solo usuarios autenticados; `products`/`expense_categories` lectura para autenticados). Revisar en fase R con `security-auditor`.

---

## 7. Impacto en server actions y tipos

- `src/lib/actions/finance.ts`: reescribir `getDayFinancials` / `getMonthFinancials` / `getMonthFinancialsDetail` sobre el nuevo modelo; añadir CRUD de `products`, `participant_items`, `expense_categories`, `expenses`; añadir `getYearFinancials`.
- `src/lib/actions/participant.ts`: al crear/editar participante, gestionar sus `participant_items` (autocompletar desde catálogo).
- `src/types/domain.ts` y `database.types.ts`: tipos nuevos.
- Componentes: `DayFinanceTab`, `FinanceMonthView`, `FinanceMonthDetail`, `FinancialSettingsForm` (pasa a gestionar categorías + tarifas), nuevo `ProductCatalogManager`, nuevo selector de productos en el alta de participante.

---

## 8. IVA-ready (cuando administración confirme)

`vat_rate` nullable ya está en products, participant_items y expenses. Al confirmar:
- Poblar vat_rate (catálogo y categorías de gasto).
- El export añade columnas base imponible / IVA / total automáticamente.
- Sin cambio de esquema.

---

## 9. Dependencias de datos (del cuestionario)

Bloquean solo el **sembrado**, no el esquema: lista de precios (Q1-7), comisiones de plataformas (Q8-9), tarifas de coste reales (Q10-17), IVA y sociedades (Q18-20). Se puede implementar el esquema ya y sembrar/afinar al recibir respuestas.
