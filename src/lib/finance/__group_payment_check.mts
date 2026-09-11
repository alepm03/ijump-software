/**
 * __group_payment_check.mts — Correctness check for splitGroupPayment()
 *
 * Run with:  node_modules/.bin/jiti src/lib/finance/__group_payment_check.mts
 *
 * The invariant that matters: the shares ALWAYS add up to exactly the amount
 * charged. A group charge becomes N payment rows, and those rows feed the cash
 * close, AR and the P&L — a cent lost to rounding here is a cent the staff has
 * to hunt for when the till doesn't match at the end of the day.
 */

import { splitGroupPayment, type GroupMemberBalance } from './group-payment.js'

function assert(condition: boolean, msg: string, detail?: unknown): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    if (detail !== undefined) console.error(`        ${JSON.stringify(detail)}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

function member(
  id: string,
  itemsTotal: number,
  paidTotal = 0,
  isOrganizer = false
): GroupMemberBalance {
  return { participantId: id, itemsTotal, paidTotal, isOrganizer }
}

const sum = (shares: { amount: number }[]) =>
  Math.round(shares.reduce((s, x) => s + x.amount, 0) * 100) / 100

const by = (shares: { participantId: string; amount: number }[], id: string) =>
  shares.find((s) => s.participantId === id)?.amount ?? 0

// ─── Proportional to what each one owes ──────────────────────

console.log('\nA. Reparto proporcional al saldo pendiente')
{
  // Organizer took the 275 € handycam, the other two the 240 € base jump.
  const members = [member('org', 275, 0, true), member('a', 240), member('b', 240)]
  const shares = splitGroupPayment(755, members)
  assert(sum(shares) === 755, 'las partes suman exactamente lo cobrado', shares)
  assert(by(shares, 'org') === 275, 'el organizador carga con su paquete más caro', shares)
  assert(by(shares, 'a') === 240 && by(shares, 'b') === 240, 'los otros dos, lo suyo', shares)
}

console.log('\nB. Cobro parcial (una señal para todo el grupo)')
{
  const members = [member('org', 275, 0, true), member('a', 240), member('b', 240)]
  const shares = splitGroupPayment(200, members)
  assert(sum(shares) === 200, 'las partes suman exactamente la señal', shares)
  assert(
    by(shares, 'org') > by(shares, 'a'),
    'quien más debe adelanta más',
    shares
  )
  assert(shares.length === 3, 'los tres reciben su parte', shares)
}

console.log('\nC. Quien ya ha pagado lo suyo no vuelve a cargar')
{
  const members = [member('org', 240, 240, true), member('a', 240), member('b', 240)]
  const shares = splitGroupPayment(480, members)
  assert(sum(shares) === 480, 'suma exacta', shares)
  assert(by(shares, 'org') === 0, 'el organizador, ya saldado, no recibe parte', shares)
  assert(by(shares, 'a') === 240 && by(shares, 'b') === 240, 'se reparte entre los que deben', shares)
}

// ─── Rounding ────────────────────────────────────────────────

console.log('\nD. Redondeo: 100 € entre tres')
{
  const members = [member('org', 100, 0, true), member('a', 100), member('b', 100)]
  const shares = splitGroupPayment(100, members)
  assert(sum(shares) === 100, 'no se pierde ni un céntimo', shares)
  assert(
    by(shares, 'org') === 33.34,
    'el céntimo sobrante va al organizador, que es quien paga',
    shares
  )
  assert(by(shares, 'a') === 33.33 && by(shares, 'b') === 33.33, 'los demás, a partes iguales', shares)
}

console.log('\nE. Redondeo con importes irregulares')
{
  const members = [member('org', 33.33, 0, true), member('a', 33.33), member('b', 33.34)]
  const shares = splitGroupPayment(50, members)
  assert(sum(shares) === 50, 'suma exacta con decimales feos', shares)
}

// ─── Casos límite ────────────────────────────────────────────

console.log('\nF. Grupo sin itemizar todavía')
{
  // Confirmed but not yet itemized: no debt to go by.
  const members = [member('org', 0, 0, true), member('a', 0), member('b', 0)]
  const shares = splitGroupPayment(300, members)
  assert(sum(shares) === 300, 'suma exacta', shares)
  assert(
    by(shares, 'org') === 100 && by(shares, 'a') === 100 && by(shares, 'b') === 100,
    'sin deuda conocida, partes iguales',
    shares
  )
}

console.log('\nG. Se paga de más')
{
  const members = [member('org', 240, 0, true), member('a', 240)]
  const shares = splitGroupPayment(600, members)
  assert(sum(shares) === 600, 'suma exacta', shares)
  assert(by(shares, 'a') === 240, 'el acompañante queda saldado, no más', shares)
  assert(by(shares, 'org') === 360, 'el exceso queda atribuido a quien paga', shares)
}

console.log('\nH. Entradas degeneradas')
{
  assert(splitGroupPayment(100, []).length === 0, 'grupo vacío: sin partes')
  assert(splitGroupPayment(0, [member('org', 240, 0, true)]).length === 0, 'importe cero: sin partes')
  assert(splitGroupPayment(-50, [member('org', 240, 0, true)]).length === 0, 'importe negativo: sin partes')

  // A booking whose organizer flag went missing must still split cleanly.
  const noOrganizer = [member('a', 100), member('b', 100)]
  const shares = splitGroupPayment(100, noOrganizer)
  assert(sum(shares) === 100, 'sin organizador marcado, sigue sumando exacto', shares)
}

console.log('\nI. Reserva de una sola persona')
{
  const shares = splitGroupPayment(275, [member('org', 275, 0, true)])
  assert(shares.length === 1 && shares[0].amount === 275, 'una persona recibe todo', shares)
}

console.log('')
if (process.exitCode === 1) {
  console.log('❌ Some assertions FAILED.\n')
} else {
  console.log('✅ All assertions PASSED.\n')
}
