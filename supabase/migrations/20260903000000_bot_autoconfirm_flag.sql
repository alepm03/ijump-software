-- Transition phase (2026-09): bot reservations wait for staff confirmation.
--
-- Until the legacy booking channel (phone/paper book) is fully migrated, the
-- availability engine only sees seats booked THROUGH this system. Letting
-- POST /api/bot/v1/reservations assign a seat straight away therefore
-- computes capacity from an incomplete picture and can double-book a flight
-- that is already full in the old book.
--
-- With this flag false the bot route creates the lead and stops: it stays NEW
-- in /reservas -> pendientes, one "Confirmar" click away from the manifest,
-- and a human validates it against the old book first.
--
-- Flip to 'true' once no reservations arrive outside this system, and the
-- endpoint goes back to confirming in a single call (its original design).

INSERT INTO business_settings (key, value, description) VALUES
  ('bot_autoconfirm_enabled', 'false',
   'When true, POST /api/bot/v1/reservations assigns a seat immediately. When false (transition phase) the lead stays NEW for staff confirmation in /reservas.')
ON CONFLICT (key) DO NOTHING;

-- ROLLBACK
-- DELETE FROM business_settings WHERE key = 'bot_autoconfirm_enabled';
