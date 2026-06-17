'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { getDayFinancials, upsertDayExpense, deleteDayExpense } from '@/lib/actions/finance'
import { Skeleton } from '@/components/ui/skeleton'
import type { DayFinancials, DayExpense } from '@/types/domain'

interface Props {
  date: string
}

function euro(amount: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)
}

function netColor(value: number): string {
  if (value > 0) return 'text-green-600'
  if (value < 0) return 'text-red-600'
  return 'text-muted-foreground'
}

export function DayFinanceTab({ date }: Props) {
  const [financials, setFinancials] = useState<DayFinancials | null | 'loading'>('loading')
  const router = useRouter()

  function reload() {
    getDayFinancials(date)
      .then(setFinancials)
      .catch((e) => {
        toast.error('Error al cargar finanzas')
        console.error(e)
        setFinancials(null)
      })
  }

  useEffect(() => {
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  if (financials === 'loading') return <DayFinanceTabSkeleton />
  if (!financials) return (
    <div className="py-12 text-center text-muted-foreground text-sm">
      No hay datos financieros para este día.
    </div>
  )

  return (
    <DayFinanceTabContent
      financials={financials}
      onRefresh={() => { reload(); router.refresh() }}
    />
  )
}

// ─── Content ────────────────────────────────────────────────

function DayFinanceTabContent({
  financials,
  onRefresh,
}: {
  financials: DayFinancials
  onRefresh: () => void
}) {
  return (
    <div className="space-y-4 max-w-[880px] mx-auto px-7 py-5">
      <RevenueSection financials={financials} />
      <CostsSection financials={financials} onRefresh={onRefresh} />
      <NetSection financials={financials} />
    </div>
  )
}

// ─── Revenue ─────────────────────────────────────────────────

function RevenueSection({ financials }: { financials: DayFinancials }) {
  const methodLabels: Record<string, string> = {
    EFECTIVO: 'Efectivo',
    TARJETA: 'Tarjeta',
    BIZUM: 'Bizum',
    TRANSFERENCIA: 'Transferencia',
    GROUPON: 'Groupon',
  }

  const methods = Object.entries(financials.revenueByMethod).filter(([, v]) => v > 0)

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-secondary/50 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ingresos</span>
        <span className="text-sm font-bold text-foreground">{euro(financials.totalRevenue)}</span>
      </div>
      {methods.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">Sin pagos registrados.</div>
      ) : (
        <div className="divide-y divide-border">
          {methods.map(([method, amount]) => (
            <div key={method} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-muted-foreground">{methodLabels[method] ?? method}</span>
              <span className="text-sm font-medium text-foreground">{euro(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Costs ───────────────────────────────────────────────────

function CostsSection({
  financials,
  onRefresh,
}: {
  financials: DayFinancials
  onRefresh: () => void
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-secondary/50 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Costes</span>
        <span className="text-sm font-bold text-foreground">{euro(financials.totalCosts)}</span>
      </div>

      <div className="divide-y divide-border">
        {/* Fuel */}
        <OverridableCostRow
          label="Gasolina"
          amount={financials.fuelCost}
          isOverride={financials.fuelIsOverride}
          expenseType="FUEL_OVERRIDE"
          operationalDayId={financials.operationalDayId}
          onRefresh={onRefresh}
          existingExpenseId={financials.fuelOverrideExpenseId ?? undefined}
        />

        {/* Hangar */}
        <OverridableCostRow
          label="Hangar"
          amount={financials.hangarCost}
          isOverride={financials.hangarIsOverride}
          expenseType="HANGAR_OVERRIDE"
          operationalDayId={financials.operationalDayId}
          onRefresh={onRefresh}
          existingExpenseId={financials.hangarOverrideExpenseId ?? undefined}
        />

        {/* Instructors */}
        {financials.instructorPayouts.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-muted-foreground">Instructores</span>
              <span className="text-sm font-medium text-foreground">{euro(financials.totalInstructorCost)}</span>
            </div>
            {financials.instructorPayouts.map((ip) => (
              <div key={ip.instructorId} className="flex items-center justify-between px-4 py-1.5 bg-secondary/20">
                <span className="text-xs text-muted-foreground pl-4">{ip.name} · {ip.jumps} salto{ip.jumps !== 1 ? 's' : ''} × {euro(ip.feePerJump)}</span>
                <span className="text-xs font-medium text-foreground">{euro(ip.total)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Packers */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-sm text-muted-foreground">Plegadores</span>
          <span className="text-sm font-medium text-foreground">{euro(financials.packerCost)}</span>
        </div>

        {/* Custom expenses */}
        {financials.customExpenses.map((expense) => (
          <CustomExpenseRow
            key={expense.id}
            expense={expense}
            onRefresh={onRefresh}
          />
        ))}

        {/* Add custom expense */}
        <AddCustomExpenseRow operationalDayId={financials.operationalDayId} onRefresh={onRefresh} />
      </div>
    </div>
  )
}

// ─── Overridable cost row ─────────────────────────────────────

function OverridableCostRow({
  label,
  amount,
  isOverride,
  expenseType,
  operationalDayId,
  onRefresh,
  existingExpenseId,
}: {
  label: string
  amount: number
  isOverride: boolean
  expenseType: 'FUEL_OVERRIDE' | 'HANGAR_OVERRIDE'
  operationalDayId: string
  onRefresh: () => void
  existingExpenseId?: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [, startTransition] = useTransition()

  function handleEdit() {
    setValue(amount.toString())
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setValue('')
  }

  function handleSave() {
    const parsed = parseFloat(value.replace(',', '.'))
    if (isNaN(parsed) || parsed < 0) {
      toast.error('Importe inválido')
      return
    }
    startTransition(async () => {
      const result = await upsertDayExpense({
        id: existingExpenseId,
        operationalDayId,
        type: expenseType,
        amount: parsed,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`${label} actualizado`)
        setEditing(false)
        onRefresh()
      }
    })
  }

  async function handleRemoveOverride() {
    if (!existingExpenseId) return
    const result = await deleteDayExpense(existingExpenseId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Override de ${label} eliminado`)
      onRefresh()
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-2">
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        {isOverride && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium">
            Override
          </span>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-28 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 text-right"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') handleCancel()
            }}
          />
          <button onClick={handleSave} className="text-green-600 hover:text-green-700 p-1 rounded transition-colors">
            <Check size={14} />
          </button>
          <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{euro(amount)}</span>
          <button
            onClick={handleEdit}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors opacity-60 hover:opacity-100"
            title={`Editar ${label}`}
          >
            <Pencil size={12} />
          </button>
          {isOverride && existingExpenseId && (
            <button
              onClick={handleRemoveOverride}
              className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors opacity-60 hover:opacity-100"
              title="Eliminar override"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Custom expense row ───────────────────────────────────────

function CustomExpenseRow({
  expense,
  onRefresh,
}: {
  expense: DayExpense
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState(expense.description ?? '')
  const [amount, setAmount] = useState(expense.amount.toString())
  const [, startTransition] = useTransition()

  function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed < 0) {
      toast.error('Importe inválido')
      return
    }
    startTransition(async () => {
      const result = await upsertDayExpense({
        id: expense.id,
        operationalDayId: expense.operationalDayId,
        type: 'CUSTOM',
        description: desc || null,
        amount: parsed,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        setEditing(false)
        onRefresh()
      }
    })
  }

  async function handleDelete() {
    const result = await deleteDayExpense(expense.id)
    if (result.error) {
      toast.error(result.error)
    } else {
      onRefresh()
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5">
        <input
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Descripción"
          className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          autoFocus
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 text-right"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <button onClick={handleSave} className="text-green-600 hover:text-green-700 p-1 rounded">
          <Check size={14} />
        </button>
        <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground p-1 rounded">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-2 group">
      <span className="text-sm text-muted-foreground flex-1">
        {expense.description || 'Gasto extra'}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{euro(expense.amount)}</span>
        <button
          onClick={() => { setDesc(expense.description ?? ''); setAmount(expense.amount.toString()); setEditing(true) }}
          className="text-muted-foreground hover:text-foreground p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={handleDelete}
          className="text-muted-foreground hover:text-destructive p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Add custom expense ───────────────────────────────────────

function AddCustomExpenseRow({
  operationalDayId,
  onRefresh,
}: {
  operationalDayId: string
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [, startTransition] = useTransition()

  function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed < 0) {
      toast.error('Importe inválido')
      return
    }
    startTransition(async () => {
      const result = await upsertDayExpense({
        operationalDayId,
        type: 'CUSTOM',
        description: desc || null,
        amount: parsed,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        setAdding(false)
        setDesc('')
        setAmount('')
        onRefresh()
      }
    })
  }

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
      >
        <Plus size={13} />
        Añadir gasto extra
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-dashed border-border/50">
      <input
        type="text"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Descripción del gasto"
        className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        autoFocus
      />
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
        className="w-24 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 text-right"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') { setAdding(false); setDesc(''); setAmount('') }
        }}
      />
      <button onClick={handleSave} className="text-green-600 hover:text-green-700 p-1 rounded">
        <Check size={14} />
      </button>
      <button
        onClick={() => { setAdding(false); setDesc(''); setAmount('') }}
        className="text-muted-foreground hover:text-foreground p-1 rounded"
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ─── Net ─────────────────────────────────────────────────────

function NetSection({ financials }: { financials: DayFinancials }) {
  return (
    <div className="rounded-xl border-2 border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5">
        <span className="text-sm font-bold text-foreground">Resultado del día</span>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Ingresos</div>
            <div className="text-sm font-semibold text-foreground">{euro(financials.totalRevenue)}</div>
          </div>
          <div className="text-muted-foreground text-sm">−</div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Costes</div>
            <div className="text-sm font-semibold text-foreground">{euro(financials.totalCosts)}</div>
          </div>
          <div className="text-muted-foreground text-sm">=</div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Neto</div>
            <div className={`text-lg font-bold ${netColor(financials.netProfit)}`}>
              {euro(financials.netProfit)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function DayFinanceTabSkeleton() {
  return (
    <div className="space-y-4 max-w-[880px] mx-auto px-7 py-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/50 border-b border-border flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex justify-between px-4 py-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
