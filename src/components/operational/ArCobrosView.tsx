import type { ArSummary, ArReceivableRow } from '@/types/domain'

/**
 * Cobros (AR) view — Sprint 1 treasury. Lists participants/groups with a
 * pending balance (Σ items − Σ payments > 0), split into:
 *   - Pendiente de cliente (DIRECT/BONO/PROMO): the client themselves owes it.
 *   - Pendiente de plataforma (GROUPON/SMARTBOX): the platform owes it — the
 *     client on-site only pays supplements. See getArSummary in finance.ts
 *     and the 2026-07-01 pricing decision.
 */

const SOURCE_LABELS: Record<string, string> = {
  DIRECT: 'Directo',
  GROUPON: 'Groupon',
  BONO: 'Bono',
  PROMO: 'Promo',
  SMARTBOX: 'Smartbox',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function ReceivableRow({ row }: { row: ArReceivableRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground w-14 flex-shrink-0">
        {formatDate(row.operationalDayDate)}
      </span>
      <span className="text-sm text-foreground font-medium flex-1 min-w-0 truncate">
        {row.fullName}
      </span>
      <span className="text-2xs font-medium px-2 py-0.5 rounded-full border border-border-strong bg-card text-muted-foreground whitespace-nowrap">
        {SOURCE_LABELS[row.source] ?? row.source}
      </span>
      <span className="text-sm font-bold text-destructive whitespace-nowrap w-16 text-right">
        {row.balance.toFixed(0)}€
      </span>
    </div>
  )
}

function Panel({
  title,
  subtitle,
  rows,
  total,
  emptyLabel,
}: {
  title: string
  subtitle: string
  rows: ArReceivableRow[]
  total: number
  emptyLabel: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-2xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <span className="text-title font-bold text-foreground">{total.toFixed(0)}€</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground px-4 py-6 text-center">{emptyLabel}</p>
      ) : (
        <div>
          {rows.map((row) => (
            <ReceivableRow key={row.participantId} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ArCobrosView({ ar }: { ar: ArSummary }) {
  const clientRows = ar.rows.filter((r) => r.owedBy === 'CLIENT')
  const platformRows = ar.rows.filter((r) => r.owedBy === 'PLATFORM')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Cobros</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Saldo pendiente por participante: importe vendido menos lo cobrado.
        </p>
      </div>

      <Panel
        title="Pendiente de cliente"
        subtitle="Reserva directa, bono o promoción — el propio cliente debe este importe"
        rows={clientRows}
        total={ar.totalPendingClient}
        emptyLabel="Sin saldos pendientes de cliente."
      />

      <Panel
        title="Pendiente de plataforma"
        subtitle="Groupon, Smartbox y similares — la plataforma paga el importe itemizado; el cliente en pista solo abona suplementos"
        rows={platformRows}
        total={ar.totalPendingPlatform}
        emptyLabel="Sin saldos pendientes de plataforma."
      />

      {Object.keys(ar.byPlatform).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Desglose por plataforma
          </h3>
          <div className="flex flex-col gap-1.5">
            {Object.entries(ar.byPlatform).map(([source, amount]) => (
              <div key={source} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{SOURCE_LABELS[source] ?? source}</span>
                <span className="font-semibold text-foreground">{amount.toFixed(0)}€</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
