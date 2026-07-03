-- ============================================================
-- Reservations-CRM Sprint 3 — Fase 0 + E2 actions:
-- reservations_move_participants(p_to_flight_id, p_participant_ids)
--
-- Purpose: move one or more participants (drag&drop between flights, or
-- bulk-reassign when cancelling a flight) into a destination flight, with
-- capacity validated server-side. The current manifest drag&drop calls
-- moveParticipant() -> a bare UPDATE flight_id with no capacity check at
-- all, which can silently overbook a flight. This RPC is the fix.
--
-- Locking / concurrency: only the DESTINATION flight is locked here
-- (`SELECT ... FOR UPDATE` on a single row in `flights`). This is safe
-- against reservations_assign_seat (20260626000000), which locks EVERY
-- flight row for the operational day with
--   PERFORM 1 FROM flights WHERE operational_day_id = v_day_id FOR UPDATE
-- before inserting/assigning. Both functions therefore always serialize on
-- at least the destination flight's row: a single-row FOR UPDATE here
-- either (a) runs before assign_seat's day-wide lock is taken, and finishes
-- (releasing the row) before assign_seat proceeds, or (b) runs after, and
-- blocks until assign_seat's transaction commits/rolls back and releases
-- the row. Neither ordering can deadlock: this function never subsequently
-- tries to lock any OTHER flight row in the same day, so there is no cycle
-- of two transactions each waiting on a row the other already holds.
--
-- Capacity check: idempotent by construction. Participants already on the
-- destination flight who are ALSO in p_participant_ids (e.g. a caller that
-- passes a slightly-too-broad set, or retries) are excluded from the
-- "already there" count via `p.id <> ALL (p_participant_ids)`, so moving a
-- participant that is already on the destination never double-counts them
-- against capacity.
--
-- Zero-orphans rule: ALL participants in p_participant_ids are moved
-- (flight_id updated), regardless of operational_status. Only participants
-- in an ACTIVE status (not CANCELLED/NO_SHOW/WEATHER_CANCELLED) consume a
-- seat and count toward max_clients_per_flight — a cancelled participant
-- still needs a flight_id (no orphan participants with flight_id NULL that
-- aren't leads), but doesn't block capacity.
--
-- confirmed_time realignment: reservations_assign_seat always sets
-- confirmed_time = the destination flight's estimated_departure_time for
-- confirmed leads. The previous drag&drop (moveParticipant, bare UPDATE)
-- left confirmed_time stale after a move, showing the old flight's time in
-- the UI. This function applies the same rule assign_seat uses, fixing
-- that inconsistency. confirmed_date is NOT touched — moves are always
-- intra-day (a move never crosses operational days).
-- ============================================================

CREATE OR REPLACE FUNCTION reservations_move_participants(
  p_to_flight_id UUID,
  p_participant_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dest              RECORD;
  v_max_clients       INTEGER;
  v_existing_active   INTEGER;
  v_moving_active     INTEGER;
  v_moved_count       INTEGER;
BEGIN
  IF p_participant_ids IS NULL OR array_length(p_participant_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_clients_per_flight'), 2)
    INTO v_max_clients;

  SELECT id, status, estimated_departure_time INTO v_dest
  FROM flights
  WHERE id = p_to_flight_id
  FOR UPDATE;

  IF v_dest.id IS NULL THEN
    RAISE EXCEPTION 'FLIGHT_NOT_FOUND';
  END IF;

  IF v_dest.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'FLIGHT_CANCELLED';
  END IF;

  -- Active participants already on the destination flight, excluding the
  -- ones being moved (idempotent: moving a participant already there must
  -- not double-count them).
  SELECT COUNT(*) INTO v_existing_active
  FROM participants p
  WHERE p.flight_id = p_to_flight_id
    AND p.id <> ALL (p_participant_ids)
    AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED');

  -- Of the participants being moved, how many are active (only active
  -- participants consume a seat; non-flying ones still move, per the
  -- zero-orphans rule, but don't count toward capacity).
  SELECT COUNT(*) INTO v_moving_active
  FROM participants p
  WHERE p.id = ANY (p_participant_ids)
    AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED');

  IF v_existing_active + v_moving_active > v_max_clients THEN
    RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
  END IF;

  -- All-or-nothing move: every participant in the array is moved, active or
  -- not (zero-orphans rule). confirmed_time is realigned to the destination
  -- flight's departure time for confirmed leads, mirroring
  -- reservations_assign_seat; confirmed_date is left untouched (intra-day
  -- move only).
  UPDATE participants
  SET flight_id = p_to_flight_id,
      confirmed_time = CASE
        WHEN lead_status = 'CONFIRMED' THEN v_dest.estimated_departure_time
        ELSE confirmed_time
      END
  WHERE id = ANY (p_participant_ids);

  GET DIAGNOSTICS v_moved_count = ROW_COUNT;
  RETURN v_moved_count;
END;
$$;

-- ============================================================
-- ROLLBACK (manual): DROP FUNCTION reservations_move_participants(UUID, UUID[]);
-- ============================================================
