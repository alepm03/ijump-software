-- ============================================================
-- bump_rate_limit — atomic fixed-window rate limiter for the bot API.
--
-- No Redis dependency (per RESERVAS_TECH_APPENDIX_v2.md §5): a 60-second
-- fixed window keyed by api_key_id + window_start (truncated to the
-- minute), upserted atomically so concurrent requests from the same key
-- can't race past the limit. Returns whether this request is allowed and,
-- if not, how many seconds until the window resets (for a Retry-After
-- header).
-- ============================================================

CREATE OR REPLACE FUNCTION bump_rate_limit(
  p_api_key_id UUID,
  p_limit_per_min INTEGER
)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := date_trunc('minute', now());
  v_count        INTEGER;
BEGIN
  INSERT INTO api_rate_limits (api_key_id, window_start, count)
  VALUES (p_api_key_id, v_window_start, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET count = api_rate_limits.count + 1
  RETURNING count INTO v_count;

  IF v_count > p_limit_per_min THEN
    RETURN QUERY SELECT FALSE, CEIL(60 - EXTRACT(SECOND FROM now()))::INTEGER;
  ELSE
    RETURN QUERY SELECT TRUE, 0;
  END IF;
END;
$$;

-- ============================================================
-- ROLLBACK (manual):
-- DROP FUNCTION IF EXISTS bump_rate_limit(UUID, INTEGER);
-- ============================================================
