'use client'

/**
 * FinancePnlView — reusable P&L presentational component.
 *
 * Renders:
 *   • KPI strip (Ingresos / Gastos / EBITDA / Margen)
 *   • Ingresos section — one row per non-zero revenue category with proportion bar
 *   • Gastos section   — grouped by COSTES_OPERATIVOS / GENERALES, with subgroup
 *                        headers (Personal / Material) inside COSTES_OPERATIVOS
 *   • Resultado        — EBITDA + margin
 *
 * Design tokens: semantic only (bg-background, bg-card, text-foreground,
 * text-muted-foreground, border-border, bg-primary, text-primary, etc.)
 * No hardcoded colors.
 */

import type { ProfitAndLoss, ProductCategory, ExpenseGroup } from '@/types/domain'

// ─── Currency formatter ────────────────────────────────────────────────────────

function euro(amount: number): string {
  // Manual es-ES grouping ('.' thousands, ',' decimals) so the separator
  // renders identically in SSR and client, independent of the Node build's
  // ICU data (small-icu drops grouping for non-en locales).
  const sign = amount < 0 ? '-' : ''
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${grouped},${decPart} €`
}

function pct(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} %`
}

// ─── Revenue category display names ───────────────────────────────────────────

const CATEGORY_LABELS: Record<ProductCategory | 'SIN_DESGLOSE' | 'DEPOSITO_RETENIDO', string> = {
  TANDEM_BASE:     'Tándem base',
  CAMERA_HANDYCAM: 'Handycam',
  CAMERA_EXTERNAL: 'Cámara externa',
  PHOTOS:          'Fotos',
  OVERWEIGHT:      'Sobrepeso (OW)',
  GROUND_REPORT:   'Reportaje en tierra',
  OTHER:           'Otros',
  SIN_DESGLOSE:    'Sin desglosar (histórico)',
  DEPOSITO_RETENIDO: 'Depósitos retenidos',
}

const CATEGORY_ORDER: Array<ProductCategory | 'SIN_DESGLOSE' | 'DEPOSITO_RETENIDO'> = [
  'TANDEM_BASE',
  'CAMERA_HANDYCAM',
  'CAMERA_EXTERNAL',
  'PHOTOS',
  'OVERWEIGHT',
  'GROUND_REPORT',
  'OTHER',
  'SIN_DESGLOSE',
  'DEPOSITO_RETENIDO',
]

// ─── Expense group display names ───────────────────────────────────────────────

const GROUP_LABELS: Record<ExpenseGroup, string> = {
  COSTES_OPERATIVOS: 'Costes Operativos',
  GENERALES:         'Gastos Generales',
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** 4-card KPI strip matching the v4 mockup layout */
function KpiStrip({ pnl }: { pnl: ProfitAndLoss }) {
  const ebitdaPositive = pnl.ebitda >= 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Ingresos"
        value={euro(pnl.revenueTotal)}
        accent
      />
      <KpiCard
        label="Gastos"
        value={euro(pnl.costsTotal)}
      />
      <KpiCard
        label="EBITDA"
        value={euro(pnl.ebitda)}
        positive={ebitdaPositive}
        negative={!ebitdaPositive && pnl.ebitda !== 0}
      />
      <KpiCard
        label="Margen"
        value={pct(pnl.ebitdaMarginPct)}
        positive={pnl.ebitdaMarginPct > 0}
        negative={pnl.ebitdaMarginPct < 0}
      />
    </div>
  )
}

function KpiCard({
  label,
  value,
  accent = false,
  positive = false,
  negative = false,
}: {
  label: string
  value: string
  accent?: boolean
  positive?: boolean
  negative?: boolean
}) {
  let valueClass = 'text-foreground'
  if (accent) valueClass = 'text-primary'
  else if (positive) valueClass = 'text-[oklch(0.560_0.130_158)]'   // success green via arbitrary
  else if (negative) valueClass = 'text-[oklch(0.560_0.200_18)]'    // danger red via arbitrary

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2 overflow-hidden">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-[1.5rem] leading-none font-bold tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Shared table header ───────────────────────────────────────────────────────

function FinColHead() {
  return (
    <div className="grid gap-0 px-4 py-2 border-b border-border bg-background"
      style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(7.5rem,1fr) 7.5rem 4rem' }}>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        Categoría
      </span>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        Proporción
      </span>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground text-right">
        Importe
      </span>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground text-right">
        %
      </span>
    </div>
  )
}

// ─── Single finance row ────────────────────────────────────────────────────────

function FinRow({
  label,
  amount,
  total,
  income = false,
}: {
  label: string
  amount: number
  total: number
  income?: boolean
}) {
  const proportion = total > 0 ? (amount / total) * 100 : 0

  return (
    <div
      className="grid items-center px-4 py-[11px] border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors"
      style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(7.5rem,1fr) 7.5rem 4rem' }}
    >
      {/* Category name */}
      <span className="text-[0.84375rem] font-medium text-foreground truncate pr-2">
        {label}
      </span>

      {/* Proportion bar */}
      <div className="pr-4">
        <div className="h-[7px] rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full ${income ? 'bg-primary' : 'bg-border'}`}
            style={{ width: `${Math.min(proportion, 100)}%` }}
          />
        </div>
      </div>

      {/* Amount */}
      <span className="text-right text-[0.875rem] font-semibold tabular-nums text-foreground tracking-tight">
        {euro(amount)}
      </span>

      {/* Percent */}
      <span className="text-right text-[0.78125rem] tabular-nums text-muted-foreground">
        {proportion.toFixed(0)} %
      </span>
    </div>
  )
}

// ─── Panel footer ──────────────────────────────────────────────────────────────

function PanelFoot({
  label,
  amount,
  accentAmount = false,
}: {
  label: string
  amount: number
  accentAmount?: boolean
}) {
  return (
    <div
      className="grid items-center px-4 py-3 border-t border-border bg-background"
      style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(7.5rem,1fr) 7.5rem 4rem' }}
    >
      <span className="text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground col-span-2">
        {label}
      </span>
      <span
        className={`text-right text-[0.9375rem] font-bold tabular-nums tracking-tight ${
          accentAmount ? 'text-primary' : 'text-foreground'
        }`}
      >
        {euro(amount)}
      </span>
      <span className="text-right text-[0.78125rem] font-semibold text-muted-foreground tabular-nums">
        100 %
      </span>
    </div>
  )
}

// ─── Revenue section ───────────────────────────────────────────────────────────

function RevenueSection({ pnl }: { pnl: ProfitAndLoss }) {
  const revenueMap = pnl.revenueByCategory as Record<string, number>

  const productEntries = CATEGORY_ORDER
    .filter((key) => key !== 'SIN_DESGLOSE')
    .map((key) => ({
      key,
      label: CATEGORY_LABELS[key],
      amount: revenueMap[key] ?? 0,
    }))
    .filter(({ amount }) => amount > 0)

  const sinDesglose = revenueMap['SIN_DESGLOSE'] ?? 0
  const allEntries = [
    ...productEntries,
    ...(sinDesglose > 0 ? [{ key: 'SIN_DESGLOSE', label: CATEGORY_LABELS['SIN_DESGLOSE'], amount: sinDesglose }] : []),
  ]

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[0.84375rem] font-semibold text-foreground tracking-tight">
          Ingresos por producto
        </span>
        <span className="text-[0.8125rem] font-semibold text-muted-foreground tabular-nums">
          Total: <strong className="text-foreground">{euro(pnl.revenueTotal)}</strong>
        </span>
      </div>

      {/* Column headers */}
      <FinColHead />

      {/* Rows */}
      {allEntries.length === 0 ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">
          Sin ingresos registrados en este periodo.
        </div>
      ) : (
        allEntries.map(({ key, label, amount }) => (
          <FinRow
            key={key}
            label={label}
            amount={amount}
            total={pnl.revenueTotal}
            income
          />
        ))
      )}

      {/* Footer */}
      <PanelFoot label="Total ingresos" amount={pnl.revenueTotal} accentAmount />
    </div>
  )
}

// ─── Cost group section ────────────────────────────────────────────────────────

const SUBGROUP_LABELS: Record<string, string> = {
  PERSONAL: 'Personal',
  MATERIAL: 'Material',
}

/** Ordered list of known subgroups; unlisted ones appear last */
const SUBGROUP_ORDER = ['PERSONAL', 'MATERIAL']

function CostCategoryRow({
  cat,
  globalTotal,
  indent = false,
}: {
  cat: ProfitAndLoss['costGroups'][number]['categories'][number]
  globalTotal: number
  indent?: boolean
}) {
  return (
    <div
      className="grid items-center px-4 py-[9px] border-b border-border last:border-b-0 hover:bg-secondary/10 transition-colors"
      style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(7.5rem,1fr) 7.5rem 4rem' }}
    >
      <span className={`text-[0.8125rem] text-muted-foreground truncate ${indent ? 'pl-6' : 'pl-3'}`}>
        {cat.name}
      </span>
      <div className="pr-4">
        <div className="h-[6px] rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-border"
            style={{ width: globalTotal > 0 ? `${Math.min((cat.amount / globalTotal) * 100, 100)}%` : '0%' }}
          />
        </div>
      </div>
      <span className="text-right text-[0.84375rem] font-medium tabular-nums text-foreground">
        {euro(cat.amount)}
      </span>
      <span className="text-right text-[0.78125rem] tabular-nums text-muted-foreground">
        {globalTotal > 0 ? ((cat.amount / globalTotal) * 100).toFixed(0) : 0} %
      </span>
    </div>
  )
}

function CostGroupSection({
  group,
  total,
  categories,
  subgroupTotals,
  globalTotal,
}: {
  group: ExpenseGroup
  total: number
  categories: ProfitAndLoss['costGroups'][number]['categories']
  subgroupTotals: Record<string, number>
  globalTotal: number
}) {
  const groupProportion = globalTotal > 0 ? (total / globalTotal) * 100 : 0

  // Hide zero-amount lines, consistent with the revenue section (which only
  // shows non-zero categories). Categories pending a rate (Swoopware, plane
  // loan, insurance) or operationally zero this period (e.g. Equipos with no
  // back-to-back) drop out of the breakdown; they remain editable in Ajustes.
  const nonZero = categories.filter((c) => c.amount !== 0)

  // Only keep subgroups that still have a non-zero total
  const hasSubgroups = Object.entries(subgroupTotals).some(([, t]) => t !== 0)

  // Sort subgroups by known order, then alphabetically (skip zero subtotals)
  const subgroups = Object.keys(subgroupTotals)
    .filter((sg) => (subgroupTotals[sg] ?? 0) !== 0)
    .sort((a, b) => {
      const ia = SUBGROUP_ORDER.indexOf(a)
      const ib = SUBGROUP_ORDER.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b)
    })

  // Separate categories that don't belong to any subgroup (non-zero only)
  const ungrouped = nonZero.filter((c) => !c.subgroup)

  return (
    <>
      {/* Group header row — strongest band + dark text: top level of the hierarchy */}
      <div className="grid items-center px-4 py-2 bg-secondary/60 border-y border-border"
        style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(7.5rem,1fr) 7.5rem 4rem' }}>
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-foreground">
          {GROUP_LABELS[group]}
        </span>
        <div className="pr-4">
          <div className="h-[5px] rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-border"
              style={{ width: `${Math.min(groupProportion, 100)}%` }}
            />
          </div>
        </div>
        <span className="text-right text-[0.8125rem] font-semibold tabular-nums text-foreground">
          {euro(total)}
        </span>
        <span className="text-right text-[0.71875rem] tabular-nums text-muted-foreground">
          {groupProportion.toFixed(0)} %
        </span>
      </div>

      {hasSubgroups ? (
        <>
          {subgroups.map((sg) => {
            const sgTotal = subgroupTotals[sg] ?? 0
            const sgCats = nonZero.filter((c) => c.subgroup === sg)
            return (
              <div key={sg}>
                {/* Subgroup header — brand-orange label marks the middle level */}
                <div className="grid items-center px-4 py-[6px] bg-secondary/20 border-b border-border"
                  style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(7.5rem,1fr) 7.5rem 4rem' }}>
                  <span className="text-[0.65625rem] font-semibold uppercase tracking-[0.06em] text-primary pl-3">
                    {SUBGROUP_LABELS[sg] ?? sg}
                  </span>
                  <div />
                  <span className="text-right text-[0.75rem] font-semibold tabular-nums text-primary/80">
                    {euro(sgTotal)}
                  </span>
                  <span />
                </div>
                {/* Subgroup categories */}
                {sgCats.map((cat) => (
                  <CostCategoryRow key={cat.categoryCode} cat={cat} globalTotal={globalTotal} indent />
                ))}
              </div>
            )
          })}
          {/* Ungrouped categories (shouldn't exist in COSTES_OPERATIVOS but safe fallback) */}
          {ungrouped.map((cat) => (
            <CostCategoryRow key={cat.categoryCode} cat={cat} globalTotal={globalTotal} />
          ))}
        </>
      ) : (
        /* Flat list — no subgroups (GENERALES) */
        nonZero.map((cat) => (
          <CostCategoryRow key={cat.categoryCode} cat={cat} globalTotal={globalTotal} />
        ))
      )}
    </>
  )
}

// ─── Costs section ─────────────────────────────────────────────────────────────

function CostsSection({ pnl }: { pnl: ProfitAndLoss }) {
  // Ensure consistent group order
  const GROUP_ORDER: ExpenseGroup[] = ['COSTES_OPERATIVOS', 'GENERALES']
  const groupMap = new Map(pnl.costGroups.map((g) => [g.group, g]))

  const groups = GROUP_ORDER.map((g) => groupMap.get(g)).filter(
    (g): g is NonNullable<typeof g> => g !== undefined && g.total > 0
  )

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[0.84375rem] font-semibold text-foreground tracking-tight">
          Gastos
        </span>
        <span className="text-[0.8125rem] font-semibold text-muted-foreground tabular-nums">
          Total: <strong className="text-foreground">{euro(pnl.costsTotal)}</strong>
        </span>
      </div>

      {/* Column headers */}
      <FinColHead />

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">
          Sin gastos registrados en este periodo.
        </div>
      ) : (
        groups.map((g) => (
          <CostGroupSection
            key={g.group}
            group={g.group}
            total={g.total}
            categories={g.categories}
            subgroupTotals={g.subgroupTotals}
            globalTotal={pnl.costsTotal}
          />
        ))
      )}

      {/* Footer */}
      <PanelFoot label="Total gastos" amount={pnl.costsTotal} />
    </div>
  )
}

// ─── Resultado section ─────────────────────────────────────────────────────────

function ResultadoSection({ pnl }: { pnl: ProfitAndLoss }) {
  const ebitdaPositive = pnl.ebitda >= 0
  let ebitdaClass = 'text-foreground'
  if (ebitdaPositive && pnl.ebitda > 0) ebitdaClass = 'text-[oklch(0.560_0.130_158)]'
  else if (pnl.ebitda < 0) ebitdaClass = 'text-[oklch(0.560_0.200_18)]'

  return (
    <div className="rounded-xl bg-card border-2 border-border overflow-hidden">
      <div className="flex items-center justify-between gap-6 flex-wrap px-5 py-4">
        <div className="min-w-0">
          <span className="text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Resultado del periodo
          </span>
          <div className={`text-[1.75rem] font-bold tabular-nums tracking-tight mt-1 ${ebitdaClass}`}>
            {euro(pnl.ebitda)}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[0.6875rem] text-muted-foreground mb-0.5">Ingresos</div>
            <div className="text-[0.875rem] font-semibold text-foreground tabular-nums">{euro(pnl.revenueTotal)}</div>
          </div>
          <span className="text-muted-foreground text-base">−</span>
          <div className="text-right">
            <div className="text-[0.6875rem] text-muted-foreground mb-0.5">Gastos</div>
            <div className="text-[0.875rem] font-semibold text-foreground tabular-nums">{euro(pnl.costsTotal)}</div>
          </div>
          <span className="text-muted-foreground text-base">=</span>
          <div className="text-right">
            <div className="text-[0.6875rem] text-muted-foreground mb-0.5">EBITDA</div>
            <div className={`text-[1.125rem] font-bold tabular-nums ${ebitdaClass}`}>{euro(pnl.ebitda)}</div>
          </div>
          <div className="text-right border-l border-border pl-4">
            <div className="text-[0.6875rem] text-muted-foreground mb-0.5">Margen</div>
            <div className={`text-[1.125rem] font-bold tabular-nums ${ebitdaClass}`}>
              {pct(pnl.ebitdaMarginPct)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────

interface FinancePnlViewProps {
  pnl: ProfitAndLoss
}

export function FinancePnlView({ pnl }: FinancePnlViewProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip */}
      <KpiStrip pnl={pnl} />

      {/* Revenue section (income panel) */}
      <RevenueSection pnl={pnl} />

      {/* Costs section */}
      <CostsSection pnl={pnl} />

      {/* Resultado */}
      <ResultadoSection pnl={pnl} />
    </div>
  )
}
