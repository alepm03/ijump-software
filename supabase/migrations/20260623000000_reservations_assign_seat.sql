-- ============================================================
-- reservations_assign_seat — concurrency-safe seat assignment for leads.
--
-- Two staff members confirming the same date/slot at the same time is a
-- real scenario (multiple devices on the manifest). A re-check in
-- JavaScript before writing is not enough: both could read "free" and both
-- write. This function serializes the critical section in Postgres with
-- SELECT ... FOR UPDATE over the day's flights, so only one caller can win
-- the last seat.
--
-- Usage from the app: supabase.rpc('reservations_assign_seat', { p_lead_id, p_date }).
-- Raises NO_SEATS_AVAILABLE if the day is already at max_flights_per_day
-- capacity with no free seats — the caller (confirmLead) should catch this
-- and mark the lead RESCHEDULE_NEEDED instead of crashing.
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
  v_flight_id         UUID;
  v_flight_time       TIME;
  v_existing_flights  INTEGER;
  v_next_flight_number INTEGER;
BEGIN
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_clients_per_flight'), 2)
    INTO v_max_clients;
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_flights_per_day'), 10)
    INTO v_max_flights;
  SELECT (SELECT value::TIME FROM business_settings WHERE key = 'default_first_flight_time')
    INTO v_default_time;

  -- Find or create the operational day for this date.
  SELECT id INTO v_day_id FROM operational_days WHERE date = p_date;
  IF v_day_id IS NULL THEN
    INSERT INTO operational_days (date) VALUES (p_date)
    ON CONFLICT (date) DO NOTHING
    RETURNING id INTO v_day_id;

    IF v_day_id IS NULL THEN
      -- Lost the insert race to a concurrent caller — read what they created.
      SELECT id INTO v_day_id FROM operational_days WHERE date = p_date;
    END IF;
  END IF;

  -- Lock every flight of this day so concurrent confirmations serialize
  -- instead of both reading the same "free seat" and double-booking it.
  PERFORM 1 FROM flights WHERE operational_day_id = v_day_id FOR UPDATE;

  -- Find a flight that still has room (active participants < cap).
  SELECT f.id, f.estimated_departure_time INTO v_flight_id, v_flight_time
  FROM flights f
  WHERE f.operational_day_id = v_day_id
    AND (
      SELECT COUNT(*) FROM participants p
      WHERE p.flight_id = f.id
        AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED')
    ) < v_max_clients
  ORDER BY f.order_index
  LIMIT 1;

  IF v_flight_id IS NULL THEN
    -- No flight with room: create a new one, respecting the daily cap.
    SELECT COUNT(*) INTO v_existing_flights FROM flights WHERE operational_day_id = v_day_id;

    IF v_existing_flights >= v_max_flights THEN
      RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
    END IF;

    v_next_flight_number := v_existing_flights + 1;

    INSERT INTO flights (operational_day_id, flight_number, order_index, estimated_departure_time)
    VALUES (v_day_id, v_next_flight_number, v_existing_flights, v_default_time)
    RETURNING id, estimated_departure_time INTO v_flight_id, v_flight_time;
  END IF;

  UPDATE participants
  SET flight_id      = v_flight_id,
      lead_status    = 'CONFIRMED',
      confirmed_date = p_date,
      confirmed_time = v_flight_time
  WHERE id = p_lead_id;

  RETURN QUERY SELECT v_flight_id, v_flight_time;
END;
$$;

-- ============================================================
-- ROLLBACK (manual):
-- DROP FUNCTION IF EXISTS reservations_assign_seat(UUID, DATE);
-- ============================================================
