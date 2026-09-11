/**
 * Splitting a single group charge across the members of a booking.
 *
 * The payments model is deliberately untouched by group bookings: one row per
 * participant, which is what keeps cash close, AR and the P&L adding up per
 * person. So when the organizer pays for everyone, the amount has to be turned
 * into one payment per member. This module decides how.
 *
 * Pure — no I/O — so the arithmetic can be checked in isolation
 * (__group_payment_check.mts). Everything is done in integer cents: splitting
 * 100 € three ways in floating point loses a cent, and a cent that vanishes
 * from a cash close is a cent someone has to hunt for at the end of the day.
 */

export type GroupMemberBalance = {
  participantId: string
  isOrganizer: boolean
  /** Σ of this member's participant_items. */
  itemsTotal: number
  /** Σ of payments already registered for this member. */
  paidTotal: number
}

export type GroupPaymentShare = {
  participantId: string
  amount: number
}

function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/**
 * Distributes `amount` across `members`, proportionally to what each one still
 * owes (their items minus what they have already paid).
 *
 * - Someone who owes nothing gets nothing, as long as anyone else still owes.
 * - When nobody owes anything yet (a booking confirmed but not itemized, or
 *   already settled), the amount is split evenly: with no debt to go by, equal
 *   shares are the only defensible answer.
 * - When the amount is more than the group owes, everyone is settled in full
 *   and the excess lands on the organizer, who is the one handing over the
 *   money — an overpayment stays attributable to a person instead of being
 *   smeared across the party.
 * - Rounding leftovers (at most a few cents) go to the organizer too, so the
 *   shares always add up to exactly the amount charged.
 */
export function splitGroupPayment(
  amount: number,
  members: GroupMemberBalance[]
): GroupPaymentShare[] {
  if (members.length === 0) return []

  const amountCents = toCents(amount)
  if (amountCents <= 0) return []

  // The organizer absorbs remainders; fall back to the first member so a
  // booking with a missing organizer flag still splits cleanly.
  const sinkIndex = Math.max(members.findIndex((m) => m.isOrganizer), 0)

  const pending = members.map((m) => Math.max(0, toCents(m.itemsTotal) - toCents(m.paidTotal)))
  const totalPending = pending.reduce((sum, p) => sum + p, 0)

  let shares: number[]

  if (totalPending === 0) {
    const even = Math.floor(amountCents / members.length)
    shares = members.map(() => even)
  } else if (amountCents >= totalPending) {
    // Everyone settled in full; the excess (if any) goes to the sink below.
    shares = [...pending]
  } else {
    shares = pending.map((p) => Math.floor((amountCents * p) / totalPending))
  }

  const distributed = shares.reduce((sum, s) => sum + s, 0)
  shares[sinkIndex] += amountCents - distributed

  return members
    .map((m, i) => ({ participantId: m.participantId, amount: shares[i] / 100 }))
    // A zero share would be a payment row for nothing: it would clutter the
    // member's history and the cash close for no reason.
    .filter((s) => s.amount !== 0)
}
