/**
 * phone.ts — Pure phone normalization utility (CRM P0: aging + dedupe).
 *
 * Mirrors the SQL normalization in
 * supabase/migrations/20260704000002_leads_aging_phone_dedupe.sql exactly —
 * keep both in sync if the rules ever change. Having the same rules in the
 * app and the DB means a value written today reads back identical to what a
 * DB-side backfill would have produced for the same input.
 *
 * No external libraries. Never throws — worst case, returns the input
 * trimmed so we never lose the raw data the staff typed in.
 */

/** True if `digits` is a bare 9-digit Spanish mobile number (starts 6/7/8/9), no country code. */
export function isNormalizedSpanishMobile(digits: string): boolean {
  return /^[6789][0-9]{8}$/.test(digits)
}

/**
 * Normalizes a phone number to canonical `+<countrycode><number>` form.
 *
 * Rules (mirror the SQL migration's UPDATE):
 * - null/undefined/blank (after trimming) -> null.
 * - Strip everything but digits, keeping a leading '+' if present.
 * - '00XX...'                                  -> '+XX...'
 * - 9 digits starting with 6/7/8/9 (ES mobile) -> '+34' + digits
 * - '34' + 9 digits (11 digits, no '+')        -> '+' + digits
 * - Already starts with '+' (after cleanup)    -> left as-is
 * - Anything else with digits (too short, foreign without '+') -> cleaned digits
 * - No digits at all (e.g. "n/a") -> the trimmed raw value, never thrown away.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null

  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  const hasLeadingPlus = trimmed.startsWith('+')
  const digits = hasLeadingPlus
    ? trimmed.slice(1).replace(/\D/g, '')
    : trimmed.replace(/\D/g, '')

  // Nothing salvageable as digits (e.g. "n/a"): return the cleaned-up raw
  // value so the data point isn't silently lost.
  if (digits.length === 0) return trimmed

  if (hasLeadingPlus) {
    return '+' + digits
  }

  if (digits.startsWith('00')) {
    return '+' + digits.slice(2)
  }

  if (isNormalizedSpanishMobile(digits)) {
    return '+34' + digits
  }

  if (/^34[0-9]{9}$/.test(digits)) {
    return '+' + digits
  }

  // Anything else (too short, foreign number without '+', etc.) — keep the
  // cleaned digits, mirroring the SQL migration's ELSE branch exactly.
  return digits
}
