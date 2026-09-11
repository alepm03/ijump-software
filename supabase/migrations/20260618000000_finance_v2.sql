-- ============================================================
-- iJump — Finance Module v2
-- Additive, reversible migration. Reproduces the 3 real Excel
-- workbooks so the gestoría can pull annual accounts.
--
-- Guiding principle: lose NOTHING about how they operate today.
--   * payments                     -> kept intact (what was COLLECTED)
--   * financial_settings           -> kept (deprecated; rates copied below)
--   * day_expenses                 -> kept (deprecated; rows copied below)
--   * participants.overweight_fee  -> kept (historical fallback)
--
-- New revenue model separates "what was SOLD" (participant_items)
-- from "what was COLLECTED" (payments). Historical participants have
-- no items, so revenue recognition falls back to payments:
--     revenue(participant) = COALESCE(SUM(items.amount), SUM(payments.amount))
-- Itemization is FORWARD-ONLY: we do NOT backfill partial items for
-- historical rows. A single OW item would otherwise flip a jumper from
-- payments-based to items-based revenue and drop their full payment
-- under the COALESCE rule. See docs/FINANCE_MODEL_V2.md (§ Compatibility).
-- ============================================================

-- ============================================================
-- 1. Enums
-- ============================================================

CREATE TYPE product_category AS ENUM (
  'TANDEM_BASE', 'CAMERA_HANDYCAM', 'CAMERA_EXTERNAL',
  'PHOTOS', 'OVERWEIGHT', 'GROUND_REPORT', 'OTHER'
);

CREATE TYPE expense_group AS ENUM ('MATERIA_PRIMA', 'PERSONAL', 'GENERALES');

CREATE TYPE rate_basis AS ENUM ('PER_FLIGHT', 'PER_JUMP', 'FIXED_PER_DAY');

-- ============================================================
-- 2. Product catalog (configurable, IVA-ready)
-- ============================================================

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  category    product_category NOT NULL,
  base_price  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  vat_rate    NUMERIC(5, 2),              -- NULL until IVA is confirmed (IVA-ready)
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ============================================================
-- 3. Sale line items (what was SOLD, per participant)
--    Separated from payments (what was COLLECTED) so we can break
--    revenue down by product and reconcile charged vs collected.
-- ============================================================

CREATE TABLE participant_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity       INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     NUMERIC(10, 2) NOT NULL,           -- snapshot at sale time
  vat_rate       NUMERIC(5, 2),                     -- snapshot, IVA-ready
  amount         NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_participant_items_participant ON participant_items(participant_id);
CREATE INDEX idx_participant_items_product ON participant_items(product_id);

-- ============================================================
-- 4. Expense categories (9 Excel categories -> EBITDA groups)
-- ============================================================

CREATE TABLE expense_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  group_type   expense_group NOT NULL,
  default_rate NUMERIC(10, 2),   -- for auto-calculated categories (NULL = manual)
  rate_basis   rate_basis,       -- NULL = purely manual or special (INSTRUCTORES)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- 5. Expenses (generalizes day_expenses; adds supplier + sociedad)
--    operational_day_id is NULLABLE -> enables fixed monthly costs
--    (insurance, gestoría) not tied to an operational day.
-- ============================================================

CREATE TABLE expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  operational_day_id  UUID REFERENCES operational_days(id) ON DELETE CASCADE,
  incurred_on         DATE NOT NULL,
  description         TEXT,
  supplier            TEXT,        -- PROVEEDOR (for the gestoría)
  sociedad            TEXT,        -- SOCIEDAD (for the gestoría)
  amount              NUMERIC(10, 2) NOT NULL,
  vat_rate            NUMERIC(5, 2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_day ON expenses(operational_day_id);
CREATE INDEX idx_expenses_category ON expenses(expense_category_id);
CREATE INDEX idx_expenses_incurred_on ON expenses(incurred_on);

CREATE TRIGGER set_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ============================================================
-- 6. RLS — mirror the existing posture (authenticated full access).
--    Single-admin MVP, same as base schema. Flagged for hardening
--    in the security pass (Workstream R).
-- ============================================================

ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON products
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated full access" ON participant_items
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated full access" ON expense_categories
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated full access" ON expenses
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- 7. Seed expense_categories (Excel category -> EBITDA group)
-- ============================================================

INSERT INTO expense_categories (code, name, group_type, rate_basis, sort_order) VALUES
  ('VUELOS',           'Vuelos (avión)',     'MATERIA_PRIMA', NULL,            10),
  ('COMBUSTIBLE',      'Combustible',        'MATERIA_PRIMA', 'PER_FLIGHT',    20),
  ('EQUIPOS',          'Equipos',            'MATERIA_PRIMA', NULL,            30),
  ('PLEGADOS',         'Plegados',           'MATERIA_PRIMA', 'PER_JUMP',      40),
  ('EDICION',          'Edición de vídeo',   'MATERIA_PRIMA', NULL,            50),
  ('COMISION_GROUPON', 'Comisión Groupon',   'MATERIA_PRIMA', NULL,            60),
  ('TASAS_AERODROMO',  'Tasas de aeródromo', 'MATERIA_PRIMA', 'FIXED_PER_DAY', 70),
  ('INSTRUCTORES',     'Instructores',       'PERSONAL',      NULL,            80),
  ('GENERALES',        'Gastos generales',   'GENERALES',     NULL,            90);

-- Carry over existing rates from financial_settings so the auto-calculated
-- categories keep producing today's numbers. Use the most recent row
-- defensively: the table is single-row by design, but don't assume it.
UPDATE expense_categories ec
SET default_rate = (SELECT fuel_price_per_flight FROM financial_settings ORDER BY updated_at DESC LIMIT 1)
WHERE ec.code = 'COMBUSTIBLE';

UPDATE expense_categories ec
SET default_rate = (SELECT packer_fee_per_jump FROM financial_settings ORDER BY updated_at DESC LIMIT 1)
WHERE ec.code = 'PLEGADOS';

UPDATE expense_categories ec
SET default_rate = (SELECT hangar_price_per_day FROM financial_settings ORDER BY updated_at DESC LIMIT 1)
WHERE ec.code = 'TASAS_AERODROMO';

-- ============================================================
-- 8. Migrate day_expenses -> expenses (overrides + custom entries).
--    FUEL_OVERRIDE   -> COMBUSTIBLE     (acts as the day override)
--    HANGAR_OVERRIDE -> TASAS_AERODROMO (acts as the day override)
--    CUSTOM          -> GENERALES       (description preserved)
--    Original day_expenses rows are left intact (deprecated).
--    One-shot: safe within this whole-file migration (the CREATEs above
--    fail-fast on re-apply). Do NOT re-run this block standalone or it
--    will duplicate rows.
-- ============================================================

INSERT INTO expenses (expense_category_id, operational_day_id, incurred_on, description, amount, created_at)
SELECT
  ec.id,
  de.operational_day_id,
  od.date,
  de.description,
  de.amount,
  de.created_at
FROM day_expenses de
JOIN operational_days od ON od.id = de.operational_day_id
JOIN expense_categories ec
  ON ec.code = CASE de.type
       WHEN 'FUEL_OVERRIDE'   THEN 'COMBUSTIBLE'
       WHEN 'HANGAR_OVERRIDE' THEN 'TASAS_AERODROMO'
       WHEN 'CUSTOM'          THEN 'GENERALES'
     END;

-- ============================================================
-- 9. Seed products — PROVISIONAL prices from chatbot KB v10.
--    The base/camera split is an ASSUMPTION pending Q1-Q5 of
--    02_roadmap/PREGUNTAS_NEGOCIO_FINANZAS.md. All prices are
--    editable in the catalog and snapshotted per line, so refining
--    them later needs no migration and does not change history.
--    Assumed bundles (totals are KB-confirmed, the split is not):
--      Tándem + Handycam   275 = 215 base + 60 handycam
--      Tándem + Vídeo ext.  390 = 215 base + 175 external
--    Standalone confirmed by KB: Fotos 20, OW (90-100 kg) 45.
-- ============================================================

INSERT INTO products (code, name, category, base_price, sort_order) VALUES
  ('TANDEM_BASE', 'Salto tándem (base)',    'TANDEM_BASE',     215, 10),
  ('HANDYCAM',    'Handycam',               'CAMERA_HANDYCAM',  60, 20),
  ('VIDEO_EXT',   'Vídeo externo (cámara)', 'CAMERA_EXTERNAL', 175, 30),
  ('FOTOS',       'Fotos',                  'PHOTOS',           20, 40),
  ('OW',          'Suplemento sobrepeso',   'OVERWEIGHT',       45, 50),
  ('REPORTAJE',   'Reportaje terrestre',    'GROUND_REPORT',     0, 60);

-- participant_items are intentionally NOT backfilled for historical
-- participants (forward-only itemization — see header + design doc).

-- ============================================================
-- ROLLBACK (run manually to fully revert this migration).
-- financial_settings and day_expenses were never modified, so
-- dropping the new objects restores the previous state exactly.
-- ------------------------------------------------------------
-- DROP TABLE IF EXISTS participant_items;
-- DROP TABLE IF EXISTS expenses;
-- DROP TABLE IF EXISTS products;
-- DROP TABLE IF EXISTS expense_categories;
-- DROP TYPE  IF EXISTS rate_basis;
-- DROP TYPE  IF EXISTS expense_group;
-- DROP TYPE  IF EXISTS product_category;
-- ============================================================
