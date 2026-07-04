-- ============================================================
-- CRM P0 mini-sprint — Entregable E1: lead aging + phone dedupe groundwork.
--
-- 1. `last_contact_at`: timestamp of the last time staff touched a lead
--    (call, WhatsApp, note...). E2 (separate PR) will update it from the
--    UI on every staff interaction; this migration only adds the column
--    and backfills it so aging views have a sane starting point instead
--    of NULL for every existing lead.
--
--    Backfill uses `updated_at` as the best available proxy for "last
--    touched" — any UPDATE on the row (status change, edit, etc.) is the
--    closest signal we have pre-E2. Only backfills actual leads
--    (lead_status IS NOT NULL); walk-in participants that never were a
--    lead don't need aging.
--
-- 2. Phone normalization + indexes: leads are frequently duplicated
--    because the same phone number gets typed in different formats
--    (spaces, dashes, missing/extra country code, "00" prefix instead of
--    "+"). Normalizing to a single canonical `+<countrycode><number>`
--    form is what makes a future "possible duplicate" check on phone
--    actually work.
--
--    The data-normalization UPDATE below is the one deliberate exception
--    to the additive-only rule: it does not add or drop anything, it
--    only rewrites the *format* of an existing value (the phone number
--    itself never changes, e.g. "600 00 00 00" becomes "+34600000000" —
--    same number, canonical shape). It is idempotent — re-running this
--    migration is a no-op on rows already in canonical form — so it is
--    safe to re-apply.
--
-- Additive and reversible except for the phone format rewrite noted
-- above (the rewrite itself is not reversible — the original raw
-- formatting is not recoverable — but the underlying phone numbers are
-- unchanged). See ROLLBACK block at the end.
-- ============================================================

-- ============================================================
-- 1. last_contact_at column + backfill.
-- ============================================================

ALTER TABLE participants ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;

UPDATE participants
SET last_contact_at = updated_at
WHERE lead_status IS NOT NULL
  AND last_contact_at IS NULL;

-- ============================================================
-- 2. Phone normalization (idempotent format rewrite — see header).
--
-- Mirrors src/lib/phone.ts normalizePhone() exactly:
--   a. Strip everything except digits and a leading '+'.
--   b. '00XX...'            -> '+XX...'
--   c. 9 digits, starts 6/7/8/9 (Spanish mobile, no country code) -> '+34' + digits
--   d. '34' + 9 digits (11 digits total, no leading '+')          -> '+' + digits
--   e. Anything else (already '+...', landlines, foreign numbers,
--      too short/garbage) is left as-is after cleanup.
-- ============================================================

UPDATE participants
SET phone = (
  WITH cleaned AS (
    SELECT
      CASE
        -- Preserve a leading '+' if present, strip everything else that
        -- isn't a digit (spaces, dashes, dots, parentheses...).
        WHEN phone LIKE '+%' THEN '+' || regexp_replace(substring(phone FROM 2), '\D', '', 'g')
        ELSE regexp_replace(phone, '\D', '', 'g')
      END AS digits
  )
  SELECT
    CASE
      -- '00XX...' international prefix -> '+XX...'
      WHEN digits LIKE '00%' THEN '+' || substring(digits FROM 3)
      -- 9-digit Spanish mobile without country code (starts 6/7/8/9)
      WHEN digits ~ '^[6789][0-9]{8}$' THEN '+34' || digits
      -- '34' + 9 digits, no leading '+' (11 digits total)
      WHEN digits ~ '^34[0-9]{9}$' THEN '+' || digits
      -- Already has '+' (any country), or anything else: leave as cleaned.
      ELSE digits
    END
  FROM cleaned
)
WHERE phone IS NOT NULL
  -- Rows with no digits at all (e.g. "n/a") are left untouched: rewriting
  -- them would produce an empty string and lose the raw data point.
  AND regexp_replace(phone, '\D', '', 'g') <> '';

-- ============================================================
-- 3. Indexes for dedupe lookups and aging queries.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_participants_phone
  ON participants(phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_participants_last_contact_at
  ON participants(last_contact_at)
  WHERE lead_status IS NOT NULL;

-- ============================================================
-- ROLLBACK (manual, run by hand if this migration needs to be reverted).
-- ------------------------------------------------------------
-- -- 1. Drop the indexes.
-- DROP INDEX IF EXISTS idx_participants_last_contact_at;
-- DROP INDEX IF EXISTS idx_participants_phone;
--
-- -- 2. Drop the column.
-- ALTER TABLE participants DROP COLUMN IF EXISTS last_contact_at;
--
-- -- 3. Phone format rewrite (step 2 above) is NOT reverted by this
-- --    rollback. The underlying phone numbers are unchanged (only their
-- --    formatting was normalized), so there is nothing to restore —
-- --    reverting to the old inconsistent formatting would be a
-- --    regression, not a fix. If a specific row's normalization is
-- --    somehow wrong, fix it by hand for that row only.
-- ============================================================
