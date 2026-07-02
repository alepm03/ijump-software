'use client'

/**
 * CashCloseModal — Sprint 2 treasury. Expected-vs-counted reconciliation
 * per payment method, live-computed with buildCashCloseRows (client-side,
 * pure — no DB import needed for the live math).
 *
 * Two modes:
 *   - Not yet closed: expected is read-only, counted is editable per method,
 *     notes is editable (required if |total discrepancy| > CASH_CLOSE_EPSILON).
 *     Confirm -> closeCash.
 *   - Already closed: read-only snapshot by default; "Corregir contado"
 *     enables editing counted/notes only (expected never editable) ->
 *     updateCashClose.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getCashCloseSummary, closeCash, updateCashClose } from '@/lib/actions/finance'
import { buildCashCloseRows, ALL_PAYMENT_METHODS, CASH_CLOSE_EPSILON } from '@/lib/finance/cash-close-engine'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type { CashCloseSummary, PaymentMethod } from '@/types/domain'

const METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  BIZUM: 'Bizum',
  TRANSFERENCIA: 'Transferencia',
  GROUPON: 'Groupon',
}

interface CashCloseModalProps {
  operationalDayId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful close/correction so the caller (button) can flip its own label. */
  onClosed?: () => void
}

export function CashCloseModal({ operationalDayId, open, onOpenChange, onClosed }: CashCloseModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<CashCloseSummary | null>(null)
  const [counted, setCounted] = useState<Partial<Record<PaymentMethod, string>>>({})
  const [notes, setNotes] = useState('')
  const [editing, setEditing] = useState(false)
  const [noteError, setNoteError] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setNoteError(false)
    getCashCloseSummary(operationalDayId)
      .then((data) => {
        setSummary(data)
        setEditing(!data.closed)
        setNotes(data.notes ?? '')
        const initialCounted: Partial<Record<PaymentMethod, string>> = {}
        for (const line of data.lines) {
          initialCounted[line.method] = data.closed ? String(line.counted) : ''
        }
        setCounted(initialCounted)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo cargar el cierre de caja')
        onOpenChange(false)
      })
      .finally(() => setLoading(false))
  }, [open, operationalDayId, onOpenChange])

  if (!summary && !loading) return null

  const expectedMap = summary
    ? (Object.fromEntries(summary.lines.map((l) => [l.method, l.expected])) as Record<PaymentMethod, number>)
    : (Object.fromEntries(ALL_PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>)

  const countedMap: Partial<Record<PaymentMethod, number>> = Object.fromEntries(
    ALL_PAYMENT_METHODS.map((m) => [m, parseFloat((counted[m] ?? '0').replace(',', '.')) || 0])
  )

  const { rows, totals } = buildCashCloseRows(expectedMap, countedMap)
  const requiresNote = Math.abs(totals.discrepancy) > CASH_CLOSE_EPSILON

  function handleCountedChange(method: PaymentMethod, value: string) {
    setCounted((prev) => ({ ...prev, [method]: value }))
  }

  function handleConfirm() {
    if (requiresNote && notes.trim() === '') {
      setNoteError(true)
      return
    }
    setNoteError(false)

    const countedPayload: Partial<Record<PaymentMethod, number>> = Object.fromEntries(
      ALL_PAYMENT_METHODS.map((m) => [m, parseFloat((counted[m] ?? '0').replace(',', '.')) || 0])
    )

    startTransition(async () => {
      if (summary?.closed && summary.cashCloseId) {
        const result = await updateCashClose(summary.cashCloseId, {
          counted: countedPayload,
          notes: notes.trim() || null,
        })
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success('Contado corregido')
      } else {
        const result = await closeCash({
          operationalDayId,
          counted: countedPayload,
          notes: notes.trim() || null,
        })
        if (result.error) {
          toast.error(result.error)
          return
        }
        const sign = totals.discrepancy > 0 ? '+' : ''
        toast.success(`Caja cerrada — descuadre ${sign}${totals.discrepancy.toFixed(2)}€`)
      }
      onOpenChange(false)
      onClosed?.()
      router.refresh()
    })
  }

  const isReadOnly = summary?.closed && !editing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cierre de caja</DialogTitle>
          <DialogDescription>
            {summary?.closed
              ? `Cerrada el ${summary.closedAt ? new Date(summary.closedAt).toLocaleString('es-ES') : ''}`
              : 'Introduce el efectivo/tarjeta/etc. contado físicamente por método.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_88px_72px] gap-2 px-3 py-2 bg-secondary/40 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Método</span>
                <span className="text-right">Esperado</span>
                <span className="text-right">Contado</span>
                <span className="text-right">Descuadre</span>
              </div>
              {rows.map((row) => {
                const hasDiscrepancy = Math.abs(row.discrepancy) > CASH_CLOSE_EPSILON
                return (
                  <div
                    key={row.method}
                    className="grid grid-cols-[1fr_80px_88px_72px] gap-2 px-3 py-2 items-center border-t border-border/50"
                  >
                    <span className="text-sm text-foreground">{METHOD_LABELS[row.method]}</span>
                    <span className="text-sm text-muted-foreground text-right tabular-nums">
                      {row.expected.toFixed(2)}€
                    </span>
                    {isReadOnly ? (
                      <span className="text-sm text-foreground text-right tabular-nums">
                        {row.counted.toFixed(2)}€
                      </span>
                    ) : (
                      <Input
                        inputMode="decimal"
                        value={counted[row.method] ?? ''}
                        onChange={(e) => handleCountedChange(row.method, e.target.value)}
                        placeholder="0.00"
                        className="h-7 text-right text-sm tabular-nums"
                      />
                    )}
                    <span
                      className={`text-sm text-right tabular-nums font-medium ${
                        hasDiscrepancy ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {row.discrepancy > 0 ? '+' : ''}
                      {row.discrepancy.toFixed(2)}€
                    </span>
                  </div>
                )
              })}
              <div className="grid grid-cols-[1fr_80px_88px_72px] gap-2 px-3 py-2 items-center border-t border-border bg-secondary/20 font-semibold">
                <span className="text-sm text-foreground">Total</span>
                <span className="text-sm text-foreground text-right tabular-nums">
                  {totals.expected.toFixed(2)}€
                </span>
                <span className="text-sm text-foreground text-right tabular-nums">
                  {totals.counted.toFixed(2)}€
                </span>
                <span
                  className={`text-sm text-right tabular-nums ${
                    Math.abs(totals.discrepancy) > CASH_CLOSE_EPSILON ? 'text-destructive' : 'text-foreground'
                  }`}
                >
                  {totals.discrepancy > 0 ? '+' : ''}
                  {totals.discrepancy.toFixed(2)}€
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Nota{requiresNote ? ' (obligatoria — hay descuadre)' : ' (opcional)'}
              </label>
              {isReadOnly ? (
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {summary?.notes || '—'}
                </p>
              ) : (
                <Textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value)
                    if (noteError && e.target.value.trim() !== '') setNoteError(false)
                  }}
                  placeholder="Explica el descuadre, incidencias, etc."
                  className="text-sm min-h-[64px] resize-none"
                />
              )}
              {noteError && (
                <p className="text-xs text-destructive mt-1">
                  Hay un descuadre — añade una nota antes de confirmar.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {isReadOnly ? (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                Corregir contado
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (summary?.closed) {
                    setEditing(false)
                  } else {
                    onOpenChange(false)
                  }
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={isPending || loading}
                onClick={handleConfirm}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isPending ? 'Guardando...' : summary?.closed ? 'Guardar corrección' : 'Cerrar caja'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
