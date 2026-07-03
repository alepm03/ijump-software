import type { CashCloseListItem } from '@/types/domain'
import { CASH_CLOSE_EPSILON } from '@/lib/finance/cash-close-engine'

/**
 * Caja view — Sprint 2 treasury. Lists recent cash closes (see ArCobrosView
 * for the sibling Cobros view this pairs with under /administracion).
 */

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function CashCloseRow({ item }: { item: CashCloseListItem }) {
  const hasDiscrepancy = Math.abs(item.totalDiscrepancy) > CASH_CLOSE_EPSILON

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground w-14 flex-shrink-0">
        {formatDate(item.operationalDayDate)}
      </span>
      <span className="text-xs text-muted-foreground w-14 flex-shrink-0">
        {formatTime(item.closedAt)}
      </span>
      <span className="text-sm text-foreground flex-1 min-w-0 text-right tabular-nums">
        {item.totalExpected.toFixed(2)}€
      </span>
      <span className="text-sm text-foreground w-20 flex-shrink-0 text-right tabular-nums">
        {item.totalCounted.toFixed(2)}€
      </span>
      <span
        className={`text-sm font-bold w-20 flex-shrink-0 text-right tabular-nums ${
          hasDiscrepancy ? 'text-destructive' : 'text-weather-ok'
        }`}
      >
        {item.totalDiscrepancy > 0 ? '+' : ''}
        {item.totalDiscrepancy.toFixed(2)}€
      </span>
      <span
        className="text-xs text-muted-foreground w-32 flex-shrink-0 truncate"
        title={item.notes ?? undefined}
      >
        {item.notes || '—'}
      </span>
    </div>
  )
}

export function CashCloseView({ cashCloses }: { cashCloses: CashCloseListItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Caja</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cierres de caja recientes: esperado vs. contado por jornada.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Cierres recientes</h2>
        </div>

        {cashCloses.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6 text-center">
            Todavía no se ha cerrado ninguna caja.
          </p>
        ) : (
          <div>
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-secondary/40 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="w-14 flex-shrink-0">Jornada</span>
              <span className="w-14 flex-shrink-0">Hora</span>
              <span className="flex-1 text-right">Esperado</span>
              <span className="w-20 flex-shrink-0 text-right">Contado</span>
              <span className="w-20 flex-shrink-0 text-right">Descuadre</span>
              <span className="w-32 flex-shrink-0">Nota</span>
            </div>
            {cashCloses.map((item) => (
              <CashCloseRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
