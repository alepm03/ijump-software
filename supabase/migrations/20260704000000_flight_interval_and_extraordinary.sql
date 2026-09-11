-- ============================================================
-- Business decisions (summer 2026 season, confirmed by Raúl):
--
-- 1. Flight cadence changes from a hardcoded +1 hour step to a
--    configurable interval: flights now depart every 45 minutes,
--    starting at 08:00 (was 09:00 / hourly). Changing season means
--    changing the `flight_interval_minutes` business_setting — no
--    seasonal branching logic anywhere in the app or the DB function.
--
-- 2. New expense category "Gasto extraordinario" (EXTRAORDINARIO):
--    a manual, non-recurring bucket for one-off spend that doesn't
--    fit any existing category. No automatic rate — amount and
--    description are entered by hand per expense, same pattern as
--    the existing GENERALES catch-all category.
--
-- Additive and reversible. See ROLLBACK block at the end.
-- ============================================================

-- ============================================================
-- 1. New configurable setting: minutes between flights.
--    reservations_assign_seat() reads this (with a 60-minute
--    fallback) instead of hardcoding INTERVAL '1 hour'.
-- ============================================================

INSERT INTO business_settings (key, value, description) VALUES
  ('flight_interval_minutes', '45', 'Minutes between consecutive flights when auto-scheduling a new one. Change per season instead of hardcoding.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. First flight of the day moves from 09:00 to 08:00 (summer 2026).
-- ============================================================

UPDATE business_settings SET value = '08:00' WHERE key = 'default_first_flight_time';

-- ============================================================
-- 3. reservations_assign_seat() — CREATE OR REPLACE with the full body
--    from 20260626000000_reservations_assign_seat_retry_flight_number.sql.
--    The ONLY behavioral change is in step 2 (finding the next free time
--    for a newly created flight): the walk-forward step used to be a
--    hardcoded INTERVAL '1 hour'; it now reads flight_interval_minutes
--    from business_settings (fallback 60) and steps by that many minutes.
--    Everything else — join-exact-time-with-room, daily cap, retry-loop
--    flight_number insert, re-sequencing — is unchanged from 20260626.
-- ============================================================

CREATE OR REPLACE FUNCTION reservations_assign_seat(
  p_lead_id UUID,
  p_date DATE
)
RETURNS TABLE (flight_id UUID, confirmed_time TIME)
LANGUAGE plpgsql
AS $$
DECLARE
  v_day_id            UUID;
  v_max_clients       INTEGER;
  v_max_flights       INTEGER;
  v_default_time      TIME;
  v_preferred_time    TIME;
  v_slot_time         TIME;
  v_new_time          TIME;
  v_flight_id         UUID;
  v_flight_time       TIME;
  v_existing_flights  INTEGER;
  v_next_flight_number INTEGER;
  v_inserted          BOOLEAN;
  v_safety            INTEGER;
  v_interval_minutes  INTEGER;
BEGIN
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_clients_per_flight'), 2)
    INTO v_max_clients;
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_flights_per_day'), 10)
    INTO v_max_flights;
  SELECT (SELECT value::TIME FROM business_settings WHERE key = 'default_first_flight_time')
    INTO v_default_time;

  SELECT preferred_time INTO v_preferred_time FROM participants WHERE id = p_lead_id;
  v_slot_time := COALESCE(v_preferred_time, v_default_time);

  SELECT id INTO v_day_id FROM operational_days WHERE date = p_date;
  IF v_day_id IS NULL THEN
    INSERT INTO operational_days (date) VALUES (p_date)
    ON CONFLICT (date) DO NOTHING
    RETURNING id INTO v_day_id;
    IF v_day_id IS NULL THEN
      SELECT id INTO v_day_id FROM operational_days WHERE date = p_date;
    END IF;
  END IF;

  PERFORM 1 FROM flights WHERE operational_day_id = v_day_id FOR UPDATE;

  -- 1. A flight at the exact requested time with room.
  SELECT f.id, f.estimated_departure_time INTO v_flight_id, v_flight_time
  FROM flights f
  WHERE f.operational_day_id = v_day_id
    AND f.estimated_departure_time = v_slot_time
    AND (
      SELECT COUNT(*) FROM participants p
      WHERE p.flight_id = f.id
        AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED')
    ) < v_max_clients
  LIMIT 1;

  -- 2. No room at the requested time: create a new flight, respecting
  --    the daily cap, at the requested time if free, or the nearest
  --    free slot after it.
  IF v_flight_id IS NULL THEN
    SELECT COUNT(*) INTO v_existing_flights FROM flights WHERE operational_day_id = v_day_id;
    IF v_existing_flights >= v_max_flights THEN
      RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
    END IF;

    -- Flight cadence is configurable (business_settings.flight_interval_minutes)
    -- instead of a hardcoded hourly step, so a season change (e.g. every 45
    -- minutes from 08:00) is just a setting update, not a code change.
    SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'flight_interval_minutes'), 60)
      INTO v_interval_minutes;

    v_new_time := v_slot_time;
    v_safety := 0;
    WHILE EXISTS (
      SELECT 1 FROM flights WHERE operational_day_id = v_day_id AND estimated_departure_time = v_new_time
    ) AND v_safety < 24 LOOP
      v_new_time := v_new_time + make_interval(mins => v_interval_minutes);
      v_safety := v_safety + 1;
    END LOOP;

    -- Insert in a retry loop: recompute flight_number fresh on each
    -- attempt and swallow unique_violation, so a stale/wrong count never
    -- crashes the confirmation — it just retries with the next number.
    v_inserted := FALSE;
    v_safety := 0;
    WHILE NOT v_inserted AND v_safety < 50 LOOP
      SELECT COALESCE(MAX(flight_number), 0) + 1 INTO v_next_flight_number
      FROM flights WHERE operational_day_id = v_day_id;

      BEGIN
        INSERT INTO flights (operational_day_id, flight_number, order_index, estimated_departure_time)
        VALUES (v_day_id, v_next_flight_number, v_next_flight_number - 1, v_new_time)
        RETURNING id, estimated_departure_time INTO v_flight_id, v_flight_time;
        v_inserted := TRUE;
      EXCEPTION WHEN unique_violation THEN
        v_safety := v_safety + 1;
      END;
    END LOOP;

    IF NOT v_inserted THEN
      RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
    END IF;
  END IF;

  UPDATE participants
  SET flight_id      = v_flight_id,
      lead_status    = 'CONFIRMED',
      confirmed_date = p_date,
      confirmed_time = v_flight_time
  WHERE id = p_lead_id;

  -- Re-sequence order_index/flight_number for the whole day so the
  -- manifest always renders in chronological departure order.
  UPDATE flights f
  SET order_index   = ranked.rn - 1,
      flight_number = ranked.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY estimated_departure_time, created_at) AS rn
    FROM flights
    WHERE operational_day_id = v_day_id
  ) ranked
  WHERE f.id = ranked.id;

  RETURN QUERY SELECT v_flight_id, v_flight_time;
END;
$$;

-- ============================================================
-- 4. New expense category: EXTRAORDINARIO.
--    group_type = 'GENERALES' (current CHECK, since 20260629, allows
--    'COSTES_OPERATIVOS' | 'GENERALES'). No rate_basis / default_rate,
--    same as the existing GENERALES-style manual categories — the
--    amount is entered by hand and the reason goes in `description`.
-- ============================================================

INSERT INTO expense_categories (code, name, group_type, rate_basis, default_rate, sort_order, active) VALUES
  ('EXTRAORDINARIO', 'Gasto extraordinario', 'GENERALES', NULL, NULL, 100, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- ROLLBACK (manual, run by hand if this migration needs to be reverted).
-- ------------------------------------------------------------
-- -- 1. Revert the flight cadence setting and first-flight time.
-- DELETE FROM business_settings WHERE key = 'flight_interval_minutes';
-- UPDATE business_settings SET value = '09:00' WHERE key = 'default_first_flight_time';
--
-- -- 2. Restore reservations_assign_seat() to the pre-45min version by
-- --    re-applying 20260626000000_reservations_assign_seat_retry_flight_number.sql
-- --    (its CREATE OR REPLACE block) — do not hand-edit this function back,
-- --    just re-run that file's function body verbatim.
--
-- -- 3. Remove the EXTRAORDINARIO category — ONLY if no expenses reference it.
-- --    Check first:
-- --      SELECT COUNT(*) FROM expenses e
-- --      JOIN expense_categories ec ON ec.id = e.expense_category_id
-- --      WHERE ec.code = 'EXTRAORDINARIO';
-- --    If zero, safe to delete:
-- --      DELETE FROM expense_categories WHERE code = 'EXTRAORDINARIO';
-- --    If non-zero, deactivate instead (matches the VUELOS/COMISION_GROUPON
-- --    pattern used elsewhere in this codebase):
-- --      UPDATE expense_categories SET active = false WHERE code = 'EXTRAORDINARIO';
-- ============================================================
