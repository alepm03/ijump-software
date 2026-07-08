'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createPayment, updatePayment, deletePayment } from '@/lib/actions/payment'
import { Button } from '@/components/ui/button'
import type { Payment, PaymentMethod, PaymentStage } from '@/types/domain'

// ─── Payment labels / stage config — tokens only, no hex ─────────────────────

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  BIZUM: 'Bizum',
  TRANSFERENCIA: 'Transfer.',
  GROUPON: 'Groupon',
}

export const STAGE_LABELS: Record<PaymentStage, string> = {
  RESERVA: 'Reserva',
  LIQUIDACION: 'Liquidación',
  SUPLEMENTO: 'Suplemento',
}

// Maps PaymentStage to token class pairs
export const STAGE_CONFIG: Record<PaymentStage, { className: string }> = {
  RESERVA:    { className: 'bg-pay-reserva-bg text-pay-reserva' },
  LIQUIDACION:{ className: 'bg-pay-liquidacion-bg text-pay-liquidacion' },
  SUPLEMENTO: { className: 'bg-pay-suplemento-bg text-pay-suplemento' },
}

// ─── Payment manager (inside Dialog) ─────────────────────────────────────────

export interface PaymentManagerProps {
  participantId: string
  payments: Payment[]
}

export function PaymentManager({ participantId, payments }: PaymentManagerProps) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('EFECTIVO')
  const [stage, setStage] = useState<PaymentStage>(() =>
    payments.some((p) => p.stage === 'RESERVA') ? 'LIQUIDACION' : 'RESERVA'
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) return
    startTransition(async () => {
      const result = await createPayment(participantId, { amount: n, method, stage })
      if (result.error) toast.error(result.error)
      else {
        setAmount('')
        router.refresh()
      }
    })
  }

  function handleUpdate(paymentId: string) {
    const n = parseFloat(editAmount)
    if (!isNaN(n) && n > 0) {
      startTransition(async () => {
        const result = await updatePayment(paymentId, { amount: n })
        if (result.error) toast.error(result.error)
        else { setEditingId(null); router.refresh() }
      })
    } else {
      setEditingId(null)
    }
  }

  function handleDelete(paymentId: string) {
    startTransition(async () => {
      const result = await deletePayment(paymentId)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Existing payments */}
      {payments.length > 0 && (
        <div className="space-y-1.5">
          {payments.map((pmt) => {
            const cfg = STAGE_CONFIG[pmt.stage]
            return (
              <div key={pmt.id} className="flex items-center gap-2.5">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 min-w-[76px] text-center ${cfg.className}`}
                >
                  {STAGE_LABELS[pmt.stage]}
                </span>

                {editingId === pmt.id ? (
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    onBlur={() => handleUpdate(pmt.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdate(pmt.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="w-20 text-sm bg-background border border-input rounded px-2 py-0.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 font-bold"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => { setEditingId(pmt.id); setEditAmount(String(pmt.amount)) }}
                    className="text-sm font-bold text-foreground hover:text-primary transition-colors"
                    title="Click para editar"
                  >
                    {pmt.amount.toFixed(0)}€
                  </button>
                )}

                <span className="text-xs text-muted-foreground">
                  {METHOD_LABELS[pmt.method]}
                </span>

                <button
                  onClick={() => handleDelete(pmt.id)}
                  disabled={isPending}
                  className="ml-auto text-muted-foreground/40 hover:text-destructive text-base leading-none transition-colors px-1"
                >
                  ×
                </button>
              </div>
            )
          })}

          <div className="flex justify-end pt-0.5">
            <span className="text-xs text-muted-foreground">
              Total:{' '}
              <strong className="text-foreground font-bold">
                {payments.reduce((s, p) => s + p.amount, 0).toFixed(0)}€
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Add payment form */}
      <div className="space-y-2.5 pt-1 border-t border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Añadir pago
        </p>
        <div className="flex gap-2">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PaymentStage)}
            className="text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 flex-1"
          >
            {(Object.entries(STAGE_LABELS) as [PaymentStage, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 flex-1"
          >
            {(Object.entries(METHOD_LABELS) as [PaymentMethod, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder="Importe €"
            className="flex-1 text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
          <Button
            onClick={handleAdd}
            disabled={isPending || !amount}
            variant="default"
            size="sm"
            className="flex-shrink-0"
          >
            Añadir
          </Button>
        </div>
      </div>
    </div>
  )
}
