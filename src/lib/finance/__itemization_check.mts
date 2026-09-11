/**
 * __itemization_check.mts — Standalone correctness check for itemization-engine.ts
 *
 * Run with:  node_modules/.bin/jiti src/lib/finance/__itemization_check.mts
 *
 * Covers the packageType -> participant_items mapping (Sprint 1 treasury)
 * and the channel price resolution (channel_product_prices with fallback
 * to products.base_price), pure — no DB.
 */

import {
  computeAutoItems,
  resolveUnitPrice,
  PACKAGE_PRODUCT_MAP,
  type ProductLookup,
  type ChannelPriceLookup,
} from './itemization-engine.js'

// ─── Helpers ─────────────────────────────────────────────────

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

// ─── Fixtures — mirrors the real seed (products + DIRECT prices) ─────────────

const PRODUCTS: ProductLookup[] = [
  { id: 'p-tandem', code: 'TANDEM_BASE', basePrice: 215 },
  { id: 'p-hc', code: 'HANDYCAM', basePrice: 60 },
  { id: 'p-video', code: 'VIDEO_EXT', basePrice: 175 },
  { id: 'p-fotos', code: 'FOTOS', basePrice: 20 },
]

// DIRECT mirrors base_price (as the migration seeds it). GROUPON has a
// negotiated net price for TANDEM_BASE only (partial coverage — HANDYCAM
// falls back to base_price, proving the fallback path).
const CHANNEL_PRICES: ChannelPriceLookup[] = [
  { channel: 'DIRECT', productId: 'p-tandem', unitPrice: 215, active: true },
  { channel: 'DIRECT', productId: 'p-hc', unitPrice: 60, active: true },
  { channel: 'DIRECT', productId: 'p-video', unitPrice: 175, active: true },
  { channel: 'DIRECT', productId: 'p-fotos', unitPrice: 20, active: true },
  { channel: 'GROUPON', productId: 'p-tandem', unitPrice: 180, active: true },
  // GROUPON + HANDYCAM: no row -> must fall back to base_price (60)
  // A GROUPON + FOTOS row exists but is INACTIVE -> must also fall back.
  { channel: 'GROUPON', productId: 'p-fotos', unitPrice: 15, active: false },
]

console.log('\n=== Itemization Engine Validation ===\n')

// ─── PACKAGE_PRODUCT_MAP coverage ─────────────────────────────

console.log('-- packageType -> product codes map --')
assert(
  JSON.stringify(PACKAGE_PRODUCT_MAP.SOLO) === JSON.stringify(['TANDEM_BASE']),
  `SOLO -> [TANDEM_BASE] (got ${JSON.stringify(PACKAGE_PRODUCT_MAP.SOLO)})`
)
assert(
  JSON.stringify(PACKAGE_PRODUCT_MAP.HANDYCAM) === JSON.stringify(['TANDEM_BASE', 'HANDYCAM']),
  `HANDYCAM -> [TANDEM_BASE, HANDYCAM] (got ${JSON.stringify(PACKAGE_PRODUCT_MAP.HANDYCAM)})`
)
assert(
  JSON.stringify(PACKAGE_PRODUCT_MAP.VIDEO_EXTERNO) === JSON.stringify(['TANDEM_BASE', 'VIDEO_EXT']),
  `VIDEO_EXTERNO -> [TANDEM_BASE, VIDEO_EXT] (got ${JSON.stringify(PACKAGE_PRODUCT_MAP.VIDEO_EXTERNO)})`
)
assert(
  JSON.stringify(PACKAGE_PRODUCT_MAP.FOTOS) === JSON.stringify(['TANDEM_BASE', 'FOTOS']),
  `FOTOS -> [TANDEM_BASE, FOTOS] (got ${JSON.stringify(PACKAGE_PRODUCT_MAP.FOTOS)})`
)
assert(
  JSON.stringify(PACKAGE_PRODUCT_MAP.HANDYCAM_FOTOS) ===
    JSON.stringify(['TANDEM_BASE', 'HANDYCAM', 'FOTOS']),
  `HANDYCAM_FOTOS -> [TANDEM_BASE, HANDYCAM, FOTOS] (got ${JSON.stringify(PACKAGE_PRODUCT_MAP.HANDYCAM_FOTOS)})`
)

// ─── resolveUnitPrice ──────────────────────────────────────────

console.log('\n-- resolveUnitPrice --')
const directTandem = resolveUnitPrice('DIRECT', PRODUCTS[0], CHANNEL_PRICES)
assert(directTandem.unitPrice === 215 && !directTandem.fallbackToBasePrice,
  `DIRECT + TANDEM_BASE = 215, no fallback (got ${JSON.stringify(directTandem)})`)

const grouponTandem = resolveUnitPrice('GROUPON', PRODUCTS[0], CHANNEL_PRICES)
assert(grouponTandem.unitPrice === 180 && !grouponTandem.fallbackToBasePrice,
  `GROUPON + TANDEM_BASE = 180 (negotiated net), no fallback (got ${JSON.stringify(grouponTandem)})`)

const grouponHandycam = resolveUnitPrice('GROUPON', PRODUCTS[1], CHANNEL_PRICES)
assert(grouponHandycam.unitPrice === 60 && grouponHandycam.fallbackToBasePrice,
  `GROUPON + HANDYCAM falls back to base_price 60 (no row; got ${JSON.stringify(grouponHandycam)})`)

const grouponFotosInactive = resolveUnitPrice('GROUPON', PRODUCTS[3], CHANNEL_PRICES)
assert(grouponFotosInactive.unitPrice === 20 && grouponFotosInactive.fallbackToBasePrice,
  `GROUPON + FOTOS falls back to base_price 20 (row exists but inactive; got ${JSON.stringify(grouponFotosInactive)})`)

// ─── computeAutoItems — DIRECT channel (catalog prices) ───────────────────────

console.log('\n-- computeAutoItems: DIRECT channel --')
const soloDirect = computeAutoItems({
  packageType: 'SOLO',
  channel: 'DIRECT',
  products: PRODUCTS,
  channelPrices: CHANNEL_PRICES,
})
assert(soloDirect.length === 1 && soloDirect[0].unitPrice === 215,
  `SOLO/DIRECT -> 1 line, TANDEM_BASE @ 215 (got ${JSON.stringify(soloDirect)})`)

const handycamFotosDirect = computeAutoItems({
  packageType: 'HANDYCAM_FOTOS',
  channel: 'DIRECT',
  products: PRODUCTS,
  channelPrices: CHANNEL_PRICES,
})
const hcfTotal = handycamFotosDirect.reduce((s, l) => s + l.unitPrice, 0)
assert(handycamFotosDirect.length === 3 && hcfTotal === 295,
  `HANDYCAM_FOTOS/DIRECT -> 3 lines totalling 215+60+20=295 (got ${hcfTotal}, ${handycamFotosDirect.length} lines)`)

// ─── computeAutoItems — GROUPON channel (mixed negotiated + fallback) ─────────

console.log('\n-- computeAutoItems: GROUPON channel (negotiated + fallback) --')
const handycamGroupon = computeAutoItems({
  packageType: 'HANDYCAM',
  channel: 'GROUPON',
  products: PRODUCTS,
  channelPrices: CHANNEL_PRICES,
})
assert(handycamGroupon.length === 2, `HANDYCAM/GROUPON -> 2 lines (got ${handycamGroupon.length})`)
const grTandemLine = handycamGroupon.find((l) => l.productCode === 'TANDEM_BASE')
const grHcLine = handycamGroupon.find((l) => l.productCode === 'HANDYCAM')
assert(grTandemLine?.unitPrice === 180 && grTandemLine?.fallbackToBasePrice === false,
  `GROUPON TANDEM_BASE line uses negotiated net 180 (got ${JSON.stringify(grTandemLine)})`)
assert(grHcLine?.unitPrice === 60 && grHcLine?.fallbackToBasePrice === true,
  `GROUPON HANDYCAM line falls back to base_price 60, flagged traceable (got ${JSON.stringify(grHcLine)})`)

// ─── computeAutoItems — missing catalog product throws loudly ────────────────

console.log('\n-- computeAutoItems: missing catalog product --')
let threw = false
try {
  computeAutoItems({
    packageType: 'VIDEO_EXTERNO',
    channel: 'DIRECT',
    products: PRODUCTS.filter((p) => p.code !== 'VIDEO_EXT'), // simulate missing catalog row
    channelPrices: CHANNEL_PRICES,
  })
} catch {
  threw = true
}
assert(threw, 'missing VIDEO_EXT product throws instead of silently generating a wrong/incomplete sale')

// ─── Invariant: every packageType resolves to a non-empty item set ───────────

console.log('\n-- Invariant: every packageType always includes TANDEM_BASE --')
for (const pkg of Object.keys(PACKAGE_PRODUCT_MAP) as (keyof typeof PACKAGE_PRODUCT_MAP)[]) {
  const lines = computeAutoItems({
    packageType: pkg,
    channel: 'DIRECT',
    products: PRODUCTS,
    channelPrices: CHANNEL_PRICES,
  })
  const hasBase = lines.some((l) => l.productCode === 'TANDEM_BASE')
  assert(hasBase, `${pkg} always includes TANDEM_BASE (got ${JSON.stringify(lines.map((l) => l.productCode))})`)
}

if (process.exitCode === 1) {
  console.log('\n❌ Some assertions FAILED.\n')
} else {
  console.log('\n✅ All assertions PASSED.\n')
}
