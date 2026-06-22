-- ============================================================
-- iJump — Finance: expense reclassification + commission model
-- Additive, reversible migration. Two changes, both presentational
-- to the P&L bottom line (they do NOT change total cost or EBITDA of
-- any historical period):
--
--   1. Reclassify expense groups. The v2 seed dumped almost every
--      category into MATERIA_PRIMA, which distorts gross margin per
--      jump. We move group_type from a Postgres ENUM to TEXT + CHECK
--      (so the taxonomy is adjustable and reversible forever — ALTER
--      TYPE ADD VALUE is not reversible and is forbidden by the repo's
--      migration discipline) and re-bucket each category:
--        COSTES_DIRECTOS = VUELOS, COMBUSTIBLE, PLEGADOS, EDICION
--        COMISIONES      = COMISION_GROUPON
--        PERSONAL        = INSTRUCTORES
--        GENERALES       = EQUIPOS, TASAS_AERODROMO, GENERALES
--
--   2. sale_channels: registry of sale channels with an adjustable
--      commission %. Two kinds (chatbot KB v10 §3.3):
--        DIRECT   (0%, no commission): Reserva directa, Bono regalo, Promoción.
--        PLATFORM (commission): Groupon, Smartbox, Wonder Box, Jumping, Freedom.
--      Platform rates are NOT confirmed yet ([PENDIENTE — S21]), seeded
--      with commission_pct = NULL. The P&L engine reads each participant's
--      channel from reservation_groups.source and applies the matching
--      channel rate; with NULL/0 rates the commission is 0, so existing
--      totals are unchanged.
--
-- This table is intentionally DECOUPLED from the reservation_source enum
-- (it is a config registry the reservations module will reuse). The 1:1
-- reconciliation (WonderBox/Jumping/Freedom are not in the enum yet) is
-- left as a note for the reservations module — see docs/FINANCE_MODEL_V2.md.
-- ============================================================

-- ============================================================
-- 1. Reclassify expense groups: ENUM expense_group -> TEXT + CHECK
-- ============================================================

-- 1a. Drop the column's dependency on the enum by widening to TEXT.
--     Existing values (MATERIA_PRIMA/PERSONAL/GENERALES) are preserved.
ALTER TABLE expense_categories
  ALTER COLUMN group_type TYPE TEXT USING group_type::TEXT;

-- 1b. Re-bucket each category into the corrected groups.
UPDATE expense_categories SET group_type = 'COSTES_DIRECTOS'
  WHERE code IN ('VUELOS', 'COMBUSTIBLE', 'PLEGADOS', 'EDICION');
UPDATE expense_categories SET group_type = 'COMISIONES'
  WHERE code = 'COMISION_GROUPON';
UPDATE expense_categories SET group_type = 'GENERALES'
  WHERE code IN ('EQUIPOS', 'TASAS_AERODROMO');
-- INSTRUCTORES (PERSONAL) and GENERALES keep their group.

-- 1c. Constrain to the new taxonomy now that all rows comply.
ALTER TABLE expense_categories
  DROP CONSTRAINT IF EXISTS expense_categories_group_type_check;
ALTER TABLE expense_categories
  ADD CONSTRAINT expense_categories_group_type_check
  CHECK (group_type IN ('COSTES_DIRECTOS', 'COMISIONES', 'PERSONAL', 'GENERALES'));

-- 1d. The enum is now unused. Drop it (recreated in ROLLBACK).
DROP TYPE IF EXISTS expense_group;

-- ============================================================
-- 2. sale_channels — sale channels and their (adjustable) commission %
-- ============================================================
-- Two kinds of channel:
--   DIRECT   — sold directly by iJump, no third-party commission (0%):
--              Reserva directa, Bono regalo, Promoción.
--   PLATFORM — independent platform that retains a commission:
--              Groupon, Smartbox, Wonder Box, Jumping, Freedom.
-- Only PLATFORM channels carry a commission_pct (NULL = pending Raúl, S21).

CREATE TABLE sale_channels (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  channel_kind   TEXT NOT NULL CHECK (channel_kind IN ('DIRECT', 'PLATFORM')),
  commission_pct NUMERIC(5, 2) CHECK (commission_pct >= 0 AND commission_pct <= 100), -- NULL = pending (PLATFORM) / not applicable (DIRECT)
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_sale_channels_updated_at
  BEFORE UPDATE ON sale_channels
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- RLS — mirror the existing posture (authenticated full access).
-- Normal app config data, same single-admin MVP stance as the other
-- finance tables. Flagged for hardening in the security pass.
ALTER TABLE sale_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON sale_channels
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Seed the real channels (chatbot KB v10 §3.3). DIRECT channels carry 0%;
-- PLATFORM rates are PENDING (NULL) until Raúl confirms (S21). code values
-- align with reservation_source where they overlap (DIRECT, BONO, PROMO,
-- GROUPON, SMARTBOX) so the engine can map source -> channel. WONDERBOX/
-- JUMPING/FREEDOM have no reservation_source value yet (reservations module
-- will extend the enum — see docs/FINANCE_MODEL_V2.md §11).
INSERT INTO sale_channels (code, name, channel_kind, commission_pct, sort_order, notes) VALUES
  ('DIRECT',    'Reserva directa', 'DIRECT',   0,    10, 'Venta directa de iJump, sin comisión'),
  ('BONO',      'Bono regalo',     'DIRECT',   0,    20, 'Bono regalo pagado íntegramente en la reserva, sin comisión'),
  ('PROMO',     'Promoción',       'DIRECT',   0,    30, 'Venta directa con promoción (grupo/pareja/puntual), sin comisión'),
  ('GROUPON',   'Groupon',         'PLATFORM', NULL, 40, 'Tarifa pendiente de confirmar (S21)'),
  ('SMARTBOX',  'Smartbox',        'PLATFORM', NULL, 50, 'Tarifa pendiente de confirmar (S21)'),
  ('WONDERBOX', 'Wonder Box',      'PLATFORM', NULL, 60, 'Tarifa pendiente; sin valor en reservation_source aún'),
  ('JUMPING',   'Jumping',         'PLATFORM', NULL, 70, 'Tarifa pendiente; sin valor en reservation_source aún'),
  ('FREEDOM',   'Freedom',         'PLATFORM', NULL, 80, 'Tarifa pendiente; sin valor en reservation_source aún');

-- ============================================================
-- ROLLBACK (run manually to fully revert this migration).
-- ------------------------------------------------------------
-- DROP TABLE IF EXISTS sale_channels;
-- ALTER TABLE expense_categories DROP CONSTRAINT IF EXISTS expense_categories_group_type_check;
-- UPDATE expense_categories SET group_type = 'MATERIA_PRIMA'
--   WHERE code IN ('VUELOS','COMBUSTIBLE','PLEGADOS','EDICION','COMISION_GROUPON','EQUIPOS','TASAS_AERODROMO');
-- CREATE TYPE expense_group AS ENUM ('MATERIA_PRIMA', 'PERSONAL', 'GENERALES');
-- ALTER TABLE expense_categories
--   ALTER COLUMN group_type TYPE expense_group USING group_type::expense_group;
-- ============================================================
