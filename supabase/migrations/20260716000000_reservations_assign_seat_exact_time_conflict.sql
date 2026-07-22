-- ============================================================
-- Exact-hour conflict for reservations_assign_seat.
--
-- Problem (reported in production): confirming a lead who requested a
-- SPECIFIC hour whose flight is already full silently created a new flight
-- at the NEXT free hour. The staff expected a conflict, not a relocation
-- to a different time.
--
-- Rule change (only for a specific preferred_time, i.e. NOT the "any hour"
-- path): if no flight at the exact requested time has room AND a flight
-- already EXISTS at that exact time (so it is full), raise
-- NO_SEATS_AVAILABLE instead of creating a flight at another hour. The
-- caller (confirmLead) maps that to classification UNAVAILABLE → the lead
-- shows as "Conflicto" and the staff must change the hour (or free room).
--
-- Unchanged:
--   - "Any hour" (preferred_time NULL): still seats in the first flight
--     with room, else creates one (20260715 behaviour).
--   - Specific time with NO flight yet at that time: still creates a flight
--     at that exact time.
--   - Specific time joining an existing flight WITH room: still joins it.
--   - Staff can still MANUALLY create a second flight at the same time from
--     the manifest — this only governs automatic reservation confirmation.
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

  -- 0. "Any hour" request: earliest non-cancelled flight of the day with room.
  IF v_preferred_time IS NULL THEN
    SELECT f.id, f.estimated_departure_time INTO v_flight_id, v_flight_time
    FROM flights f
    WHERE f.operational_day_id = v_day_id
      AND f.status <> 'CANCELLED'
      AND (
        SELECT COUNT(*) FROM participants p
        WHERE p.flight_id = f.id
          AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED')
      ) < v_max_clients
    ORDER BY f.estimated_departure_time NULLS LAST, f.created_at
    LIMIT 1;
  END IF;

  -- 1. A flight at the exact requested time with room.
  IF v_flight_id IS NULL THEN
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
  END IF;

  -- 1b. Specific-hour conflict: the caller asked for an exact time, no flight
  --     at that time has room, AND a (non-cancelled) flight already exists
  --     there — so it is full. Do NOT relocate to another hour: raise so the
  --     lead stays a Conflicto for the staff to resolve.
  IF v_flight_id IS NULL AND v_preferred_time IS NOT NULL AND EXISTS (
    SELECT 1 FROM flights
    WHERE operational_day_id = v_day_id
      AND estimated_departure_time = v_slot_time
      AND status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
  END IF;

  -- 2. No room at the requested time and no flight exists there yet: create a
  --    new flight, respecting the daily cap, at the requested time if free, or
  --    the nearest free hour after it.
  IF v_flight_id IS NULL THEN
    SELECT COUNT(*) INTO v_existing_flights FROM flights WHERE operational_day_id = v_day_id;
    IF v_existing_flights >= v_max_flights THEN
      RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
    END IF;

    v_new_time := v_slot_time;
    v_safety := 0;
    WHILE EXISTS (
      SELECT 1 FROM flights WHERE operational_day_id = v_day_id AND estimated_departure_time = v_new_time
    ) AND v_safety < 24 LOOP
      v_new_time := v_new_time + INTERVAL '1 hour';
      v_safety := v_safety + 1;
    END LOOP;

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
-- ROLLBACK (manual): restore the previous version from
-- 20260715000000_reservations_assign_seat_any_time.sql by re-running its
-- CREATE OR REPLACE FUNCTION block.
-- ============================================================
