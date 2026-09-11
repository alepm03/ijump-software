-- ============================================================
-- Extend `channel` with STAFF_PHONE / STAFF_WHATSAPP
-- ============================================================
--
-- Context (docs/reservas/CRM_REVIEW_2026-07.md, roadmap item 3):
-- `channel` (WEB_BOT | WHATSAPP_BOT | STAFF) does not distinguish whether a
-- staff-entered lead came in by phone or by WhatsApp. Unlike
-- `reservation_source` (a native Postgres ENUM — see
-- 20260704000001_reservation_source_platforms.sql), `channel` is a plain
-- TEXT column with a CHECK constraint (20260622000000_reservations.sql:19,
-- 27-28, 40, 44-45), so this is an ordinary, fully reversible
-- DROP/ADD CONSTRAINT — the ALTER TYPE irreversibility exception from
-- issue #43 does not apply here.
-- ============================================================

ALTER TABLE participants
  DROP CONSTRAINT participants_channel_check,
  ADD CONSTRAINT participants_channel_check
    CHECK (channel IN ('WEB_BOT', 'WHATSAPP_BOT', 'STAFF', 'STAFF_PHONE', 'STAFF_WHATSAPP'));

ALTER TABLE reservation_groups
  DROP CONSTRAINT reservation_groups_channel_check,
  ADD CONSTRAINT reservation_groups_channel_check
    CHECK (channel IN ('WEB_BOT', 'WHATSAPP_BOT', 'STAFF', 'STAFF_PHONE', 'STAFF_WHATSAPP'));

-- ============================================================
-- ROLLBACK (manual, run by hand if this migration needs to be reverted).
-- Reassign any row already using STAFF_PHONE/STAFF_WHATSAPP to STAFF before
-- running this, otherwise the narrower CHECK will reject them.
-- ============================================================
-- ALTER TABLE participants
--   DROP CONSTRAINT participants_channel_check,
--   ADD CONSTRAINT participants_channel_check
--     CHECK (channel IN ('WEB_BOT', 'WHATSAPP_BOT', 'STAFF'));
--
-- ALTER TABLE reservation_groups
--   DROP CONSTRAINT reservation_groups_channel_check,
--   ADD CONSTRAINT reservation_groups_channel_check
--     CHECK (channel IN ('WEB_BOT', 'WHATSAPP_BOT', 'STAFF'));
-- ============================================================
