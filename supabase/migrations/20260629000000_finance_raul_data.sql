-- ============================================================
-- iJump — Finance: Raúl real-data adjustments
-- Additive, reversible migration. Corrects the provisional
-- model with confirmed business data:
--
--   1. Add `subgroup` column to expense_categories (TEXT, nullable).
--      Allows sub-grouping within a top-level group (e.g. PERSONAL
--      and MATERIAL within COSTES_OPERATIVOS) for P&L subtotals.
--
--   2. Add `is_back_to_back` to flights (BOOLEAN, default FALSE).
--      Marks back-to-back flights where rented equipment is needed
--      (EQUIPOS cost = 25 € × completed jumps on those flights).
--
--   3. Reclassify expense groups:
--        COSTES_DIRECTOS   → COSTES_OPERATIVOS  (rename)
--        PERSONAL/INSTRUCTORES → COSTES_OPERATIVOS (fold in)
--        GENERALES/EQUIPOS stays GENERALES → moved to COSTES_OPERATIVOS
--        COMISIONES/COMISION_GROUPON → GENERALES + deactivated
--      Revenue from platforms (Groupon/Smartbox) already arrives
--      NET; subtracting a commission would be double-counting.
--      COMISION_GROUPON is kept (not deleted) for historical data
--      integrity but deactivated so it no longer affects the P&L.
--
--   4. New categories: PILOTO, CAMARA_EXTERNA, SWOOPWARE,
--      CUOTA_PRESTAMO_AVION, SEGURO_AVION.
--
--   5. Real rates: INSTRUCTORES 30€/jump, PLEGADOS 15€/jump,
--      EDICION 10€/jump, TASAS_AERODROMO 1040€/day (bundle).
--
-- The `sale_channels` table is KEPT as a channel registry used
-- by the reservations module; commission_pct is kept as an
-- informational field. The P&L engine no longer reads it.
--
-- ROLLBACK: see commented block at the end of this file.
-- ============================================================

-- ============================================================
-- 1. New columns (fully additive)
-- ============================================================

ALTER TABLE expense_categories
  ADD COLUMN subgroup TEXT;

ALTER TABLE flights
  ADD COLUMN is_back_to_back BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 2. Drop old CHECK before reclassifying groups
--    (constraint prevents setting 'COSTES_OPERATIVOS')
-- ============================================================

ALTER TABLE expense_categories
  DROP CONSTRAINT IF EXISTS expense_categories_group_type_check;

-- ============================================================
-- 3. Reclassify expense groups
-- ============================================================

-- 3a. Rename COSTES_DIRECTOS → COSTES_OPERATIVOS
UPDATE expense_categories
  SET group_type = 'COSTES_OPERATIVOS'
  WHERE group_type = 'COSTES_DIRECTOS';

-- 3b. Move INSTRUCTORES (was PERSONAL) into COSTES_OPERATIVOS
UPDATE expense_categories
  SET group_type = 'COSTES_OPERATIVOS'
  WHERE code = 'INSTRUCTORES';

-- 3c. Move EQUIPOS (was GENERALES) into COSTES_OPERATIVOS
UPDATE expense_categories
  SET group_type = 'COSTES_OPERATIVOS'
  WHERE code = 'EQUIPOS';

-- 3d. Move COMISION_GROUPON (was COMISIONES) into GENERALES
--     then deactivate — income from platforms is already net.
UPDATE expense_categories
  SET group_type = 'GENERALES',
      active     = FALSE
  WHERE code = 'COMISION_GROUPON';

-- ============================================================
-- 4. Add new CHECK (only two groups now)
-- ============================================================

ALTER TABLE expense_categories
  ADD CONSTRAINT expense_categories_group_type_check
  CHECK (group_type IN ('COSTES_OPERATIVOS', 'GENERALES'));

-- ============================================================
-- 5. Set subgroups (PERSONAL / MATERIAL within COSTES_OPERATIVOS)
-- ============================================================

UPDATE expense_categories
  SET subgroup = 'PERSONAL'
  WHERE code IN ('INSTRUCTORES', 'PLEGADOS');

UPDATE expense_categories
  SET subgroup = 'MATERIAL'
  WHERE code IN ('VUELOS', 'COMBUSTIBLE', 'EDICION', 'EQUIPOS');

-- ============================================================
-- 6. Update real rates and names
-- ============================================================

UPDATE expense_categories SET default_rate = 30  WHERE code = 'INSTRUCTORES';
UPDATE expense_categories SET default_rate = 15  WHERE code = 'PLEGADOS';
UPDATE expense_categories SET default_rate = 10  WHERE code = 'EDICION';

-- Bundle aeródromo: hangaraje + luz + 2 habitaciones = 1040 €/mes
-- Note: +200 €/mes aplazamiento (may–dic 2026) is a TEMPORARY financing
-- line and must NOT be included in the recurring bundle rate.
-- Document it separately in the expense row description if needed.
UPDATE expense_categories
  SET default_rate = 1040,
      name         = 'Tasas aeródromo, hangaraje, luz, habitaciones'
  WHERE code = 'TASAS_AERODROMO';

-- ============================================================
-- 7. Insert new categories
-- ============================================================

-- PILOTO: 15 €/vuelo (PER_FLIGHT) — subgroup PERSONAL
INSERT INTO expense_categories (code, name, group_type, subgroup, rate_basis, default_rate, sort_order)
  VALUES ('PILOTO', 'Piloto', 'COSTES_OPERATIVOS', 'PERSONAL', 'PER_FLIGHT', 15, 85);

-- CAMARA_EXTERNA: 35 €/salto con vídeo externo (PER_JUMP stored, but
-- the P&L engine special-cases it: cost = rate × videoExtJumpCount only).
-- rate_basis = PER_JUMP so the rate appears editable in the settings form.
INSERT INTO expense_categories (code, name, group_type, subgroup, rate_basis, default_rate, sort_order)
  VALUES ('CAMARA_EXTERNA', 'Monitor cámara externa', 'COSTES_OPERATIVOS', 'PERSONAL', 'PER_JUMP', 35, 90);

-- SWOOPWARE: ~30 USD/mes video-editing software. Stored in EUR.
-- ⚠ Pending exact EUR amount from Raúl — set to 0 until confirmed.
-- default_rate stored as FIXED_PER_DAY; admin enters actual monthly total
-- as a manual expense row once amount is confirmed.
INSERT INTO expense_categories (code, name, group_type, subgroup, rate_basis, default_rate, sort_order)
  VALUES ('SWOOPWARE', 'Software edición Swoopware (~30 USD/mes)', 'GENERALES', NULL, 'FIXED_PER_DAY', 0, 100);

-- CUOTA_PRESTAMO_AVION: monthly loan repayment for the plane.
-- ⚠ Exact bank instalment pending confirmation — set to 0 until confirmed.
-- Loan: 150.000 € / 7 years, started June 2026. No amortisation table
-- (interest rate unknown); book the full instalment as a fixed cost.
INSERT INTO expense_categories (code, name, group_type, subgroup, rate_basis, default_rate, sort_order)
  VALUES ('CUOTA_PRESTAMO_AVION', 'Cuota préstamo avión', 'GENERALES', NULL, 'FIXED_PER_DAY', 0, 110);

-- SEGURO_AVION: plane insurance.
-- ⚠ Pending confirmation from Raúl whether this is separate from
-- the aerodrome bundle or already included.
INSERT INTO expense_categories (code, name, group_type, subgroup, rate_basis, default_rate, sort_order)
  VALUES ('SEGURO_AVION', 'Seguro avión', 'GENERALES', NULL, 'FIXED_PER_DAY', 0, 120);

-- ============================================================
-- ROLLBACK (run manually to fully revert this migration).
-- Rates are NOT restored automatically — update them manually
-- to the previous values if needed.
-- ------------------------------------------------------------
-- DELETE FROM expense_categories
--   WHERE code IN ('PILOTO','CAMARA_EXTERNA','SWOOPWARE','CUOTA_PRESTAMO_AVION','SEGURO_AVION');
--
-- UPDATE expense_categories SET active = TRUE WHERE code = 'COMISION_GROUPON';
--
-- ALTER TABLE expense_categories DROP CONSTRAINT IF EXISTS expense_categories_group_type_check;
--
-- UPDATE expense_categories SET group_type = 'COSTES_DIRECTOS'
--   WHERE code IN ('VUELOS','COMBUSTIBLE','PLEGADOS','EDICION');
-- UPDATE expense_categories SET group_type = 'PERSONAL'
--   WHERE code = 'INSTRUCTORES';
-- UPDATE expense_categories SET group_type = 'GENERALES'
--   WHERE code = 'EQUIPOS';
-- UPDATE expense_categories SET group_type = 'COMISIONES'
--   WHERE code = 'COMISION_GROUPON';
--
-- ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_group_type_check
--   CHECK (group_type IN ('COSTES_DIRECTOS','COMISIONES','PERSONAL','GENERALES'));
--
-- UPDATE expense_categories SET subgroup = NULL;
--
-- ALTER TABLE expense_categories DROP COLUMN IF EXISTS subgroup;
-- ALTER TABLE flights DROP COLUMN IF EXISTS is_back_to_back;
-- ============================================================
