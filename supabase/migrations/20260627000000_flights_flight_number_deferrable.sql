-- ============================================================
-- Make flights_operational_day_id_flight_number_key DEFERRABLE.
--
-- Real root cause of the "duplicate key ... flight_number" error seen
-- when confirming a lead (not the insert, which the previous migration
-- already hardened): the chronological re-sequencing step at the end of
-- reservations_assign_seat does a single set-based UPDATE that can swap
-- flight_number values between rows, e.g. flights (10:00, #1) and
-- (11:00, #2) need to become (#2) and (#3) once a new 09:00 flight takes
-- #1. With a NOT DEFERRABLE unique constraint (the default), Postgres
-- checks the constraint after each row is updated, not after the whole
-- statement — so whichever row happens to be updated first to a number
-- still held by another not-yet-updated row in the same UPDATE fails
-- with a unique violation, even though the final state is perfectly
-- valid. Reproduced directly against production: confirming a lead
-- consistently failed at flight_number=2 regardless of which version of
-- the insert logic was deployed, because the insert was never the
-- problem.
--
-- Fix: mark the constraint DEFERRABLE INITIALLY DEFERRED so all checks
-- happen once at transaction commit, after the full UPDATE (and the
-- whole function call) has settled into its final, valid state.
-- ============================================================

ALTER TABLE flights DROP CONSTRAINT flights_operational_day_id_flight_number_key;

ALTER TABLE flights ADD CONSTRAINT flights_operational_day_id_flight_number_key
  UNIQUE (operational_day_id, flight_number) DEFERRABLE INITIALLY DEFERRED;

-- ============================================================
-- ROLLBACK (manual):
-- ALTER TABLE flights DROP CONSTRAINT flights_operational_day_id_flight_number_key;
-- ALTER TABLE flights ADD CONSTRAINT flights_operational_day_id_flight_number_key
--   UNIQUE (operational_day_id, flight_number);
-- ============================================================
