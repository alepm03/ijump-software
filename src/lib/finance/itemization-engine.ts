/**
 * itemization-engine.ts — Pure auto-itemization computation module.
 *
 * Sprint 1 treasury: packageType -> participant_items. Intentionally
 * dependency-free beyond domain types, same discipline as pnl-engine.ts:
 *   - NO 'use server'
 *   - NO DB / Supabase imports
 *   - NO Next.js imports
 *
 * All functions here are pure (deterministic, no side effects) and
 * therefore unit-testable without any infrastructure. The I/O (reading
 * products/prices, writing participant_items) lives in
 * src/lib/actions/finance.ts, which calls into this module.
 */

import type { PackageType, ReservationSource } from '@/types/domain'

/**
 * Balance rounding epsilon shared by every AR balance check (server-side
 * getArSummary in finance.ts and the client-side BalanceBadge in
 * ParticipantRow.tsx). A single constant avoids the two surfaces silently
 * disagreeing about whether a sub-cent rounding remainder counts as "still
 * owed" — a mismatch would show a balance badge on the manifest row for a
 * participant that getArSummary considers settled, or vice versa.
 */
export const AR_BALANCE_EPSILON = 0.01

/** Product catalog codes referenced by the packageType map (see products seed). */
export type BaseProductCode = 'TANDEM_BASE' | 'HANDYCAM' | 'VIDEO_EXT' | 'FOTOS'

/**
 * packageType -> product codes to auto-generate as participant_items.
 * SOLO           -> TANDEM_BASE
 * HANDYCAM       -> TANDEM_BASE + HANDYCAM
 * VIDEO_EXTERNO  -> TANDEM_BASE + VIDEO_EXT
 * FOTOS          -> TANDEM_BASE + FOTOS
 * HANDYCAM_FOTOS -> TANDEM_BASE + HANDYCAM + FOTOS
 */
export const PACKAGE_PRODUCT_MAP: Record<PackageType, BaseProductCode[]> = {
  SOLO: ['TANDEM_BASE'],
  HANDYCAM: ['TANDEM_BASE', 'HANDYCAM'],
  VIDEO_EXTERNO: ['TANDEM_BASE', 'VIDEO_EXT'],
  FOTOS: ['TANDEM_BASE', 'FOTOS'],
  HANDYCAM_FOTOS: ['TANDEM_BASE', 'HANDYCAM', 'FOTOS'],
}

export interface ProductLookup {
  id: string
  code: string
  basePrice: number
}

export interface ChannelPriceLookup {
  channel: ReservationSource
  productId: string
  unitPrice: number
  active: boolean
}

/** One resolved line the caller must upsert as a participant_items row. */
export interface ResolvedItemLine {
  productId: string
  productCode: BaseProductCode
  quantity: 1
  unitPrice: number
  /** True when no active channel_product_prices row existed and we fell back to base_price. */
  fallbackToBasePrice: boolean
}

/**
 * Resolves the unit price for a product sold through a channel:
 *   1. An active channel_product_prices row for (channel, productId) wins.
 *   2. Otherwise, falls back to products.base_price (traceable via
 *      `fallbackToBasePrice` so callers/UI can flag it if desired).
 */
export function resolveUnitPrice(
  channel: ReservationSource,
  product: ProductLookup,
  channelPrices: ChannelPriceLookup[]
): { unitPrice: number; fallbackToBasePrice: boolean } {
  const match = channelPrices.find(
    (cp) => cp.channel === channel && cp.productId === product.id && cp.active
  )
  if (match) return { unitPrice: match.unitPrice, fallbackToBasePrice: false }
  return { unitPrice: product.basePrice, fallbackToBasePrice: true }
}

/**
 * Computes the full set of auto-generated item lines for a participant's
 * packageType + sale channel. Pure function: given the same inputs, always
 * returns the same lines. Caller is responsible for diffing against
 * existing auto_generated rows and applying the DB writes (idempotency).
 *
 * Throws if a required product code from PACKAGE_PRODUCT_MAP is missing
 * from `products` — this is a data integrity issue (catalog must contain
 * TANDEM_BASE/HANDYCAM/VIDEO_EXT/FOTOS) that should surface loudly rather
 * than silently generating an incomplete/wrong sale.
 */
export function computeAutoItems(params: {
  packageType: PackageType
  channel: ReservationSource
  products: ProductLookup[]
  channelPrices: ChannelPriceLookup[]
}): ResolvedItemLine[] {
  const { packageType, channel, products, channelPrices } = params
  const codes = PACKAGE_PRODUCT_MAP[packageType]

  return codes.map((code) => {
    const product = products.find((p) => p.code === code)
    if (!product) {
      throw new Error(
        `itemization-engine: product code "${code}" not found in catalog (required for packageType ${packageType})`
      )
    }
    const { unitPrice, fallbackToBasePrice } = resolveUnitPrice(channel, product, channelPrices)
    return {
      productId: product.id,
      productCode: code,
      quantity: 1,
      unitPrice,
      fallbackToBasePrice,
    }
  })
}
