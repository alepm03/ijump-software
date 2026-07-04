/**
 * __phone_check.mts — Standalone correctness check for phone.ts
 *
 * Run with:  node_modules/.bin/jiti src/lib/__phone_check.mts
 *
 * Covers normalizePhone() rules (CRM P0: aging + dedupe) — must mirror
 * the SQL UPDATE in
 * supabase/migrations/20260704000002_leads_aging_phone_dedupe.sql.
 */

import { normalizePhone } from './phone.js'

// ─── Helpers ─────────────────────────────────────────────────

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  assert(actual === expected, `${label} -> expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

console.log('\n=== Phone Normalization Validation ===\n')

// ─── Core cases ──────────────────────────────────────────────

console.log('-- basic formats -> canonical +34 mobile --')
assertEqual(normalizePhone('600 00 00 00'), '+34600000000', '"600 00 00 00"')
assertEqual(normalizePhone('+34 600-000-000'), '+34600000000', '"+34 600-000-000"')
assertEqual(normalizePhone('0034600000000'), '+34600000000', '"0034600000000"')
assertEqual(normalizePhone('34600000000'), '+34600000000', '"34600000000"')
assertEqual(normalizePhone('600000000'), '+34600000000', '"600000000"')

console.log('\n-- foreign number with + is left alone (just cleaned) --')
assertEqual(normalizePhone('+44 7911 123456'), '+447911123456', '"+44 7911 123456"')

console.log('\n-- passthrough for unsalvageable input --')
assertEqual(normalizePhone('n/a'), 'n/a', '"n/a"')

console.log('\n-- empty / null -> null --')
assertEqual(normalizePhone(''), null, '""')
assertEqual(normalizePhone(null), null, 'null')
assertEqual(normalizePhone(undefined), null, 'undefined')

// ─── Idempotence ─────────────────────────────────────────────

console.log('\n-- idempotence: normalizePhone(normalizePhone(x)) === normalizePhone(x) --')
const cases = [
  '600 00 00 00',
  '+34 600-000-000',
  '0034600000000',
  '34600000000',
  '600000000',
  '+44 7911 123456',
  'n/a',
  '',
]

for (const c of cases) {
  const once = normalizePhone(c)
  const twice = normalizePhone(once)
  assertEqual(twice, once, `idempotent for ${JSON.stringify(c)}`)
}
assertEqual(normalizePhone(normalizePhone(null)), normalizePhone(null), 'idempotent for null')

console.log('\n=== Done ===\n')

if (process.exitCode === 1) {
  console.error('Some checks FAILED.')
} else {
  console.log('All checks PASSED.')
}
