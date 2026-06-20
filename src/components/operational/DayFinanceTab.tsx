'use client'

/**
 * DayFinanceTab — v2 migration
 *
 * DISPLAY  : Shows the day's P&L via <FinancePnlView> (revenue by product
 *            category + grouped cost structure → EBITDA).
 *
 * EXPENSES : A day-scoped panel below the P&L that lists, adds, edits, and
 *            deletes expenses in the v2 `expenses` table via:
 *              listExpenses({ operationalDayId })
 *              createExpense / updateExpense / deleteExpense
 *            Writes are intentionally decoupled from the P&L re-fetch so
 *            the P&L display always reflects the DB truth after reload.
 *
 * PROPS    : { date: string } — unchanged from v1 so the parent DayManifest
 *            continues to work without modification.
 *
 * REMOVED  : All calls to getDayFinancials / upsertDayExpense / deleteDayExpense
 *            (v1, day_expenses table).  Those functions stay untouched in
 *            finance.ts for historical reporting.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  getDayPnl,
  getOperationalDayId,
  listExpenses,
  listExpenseCategories,
  createExpense,
  updateExpense,
  deleteExpense,
} from '@/lib/actions/finance'
import { FinancePnlView } from '@/components/operational/FinancePnlView'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProfitAndLoss, Expense, ExpenseCategory } from '@/types/domain'

// ─── Currency formatter (manual es-ES, small-icu safe) ────────────────────────

function euro(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${grouped},${decPart} €`
}

// ─── Prop interface (unchanged from v1) ───────────────────────────────────────

interface Props {
  date: string
}

// ─── Async data shape ─────────────────────────────────────────────────────────

interface DayData {
  pnl: ProfitAndLoss
  operationalDayId: string | null
  expenses: Expense[]
  categories: ExpenseCategory[]
}

// ─── Root component ───────────────────────────────────────────────────────────

export function DayFinanceTab({ date }: Props) {
  const [data, setData] = useState<DayData | null | 'loading'>('loading')
  const router = useRouter()

  async function load() {
    try {
      // Fetch P&L, operationalDayId, and categories in parallel.
      // Expenses depend on the operationalDayId so they are fetched
      // in a second step (still fast — single Supabase query).
      const [pnl, operationalDayId, categories] = await Promise.all([
        getDayPnl(date),
        getOperationalDayId(date),
        listExpenseCategories(),
      ])

      const expenses = operationalDayId
        ? await listExpenses({ operationalDayId })
        : []

      setData({ pnl, operationalDayId, expenses, categories })
    } catch (e) {
      toast.error('Error al cargar finanzas')
      console.error(e)
      setData(null)
    }
  }

  useEffect(() => {
    setData('loading')
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  function handleRefresh() {
    load()
    router.refresh()
  }

  if (data === 'loading') return <DayFinanceTabSkeleton />
  if (!data) return (
    <div className="py-12 text-center text-muted-foreground text-sm">
      No hay datos financieros para este día.
    </div>
  )

  return (
    <div className="space-y-5 max-w-[880px] mx-auto px-7 py-5">
      {/* P&L display via FinancePnlView */}
      <FinancePnlView pnl={data.pnl} />

      {/* Day-scoped expense entry panel */}
      {data.operationalDayId && (
        <ExpensePanel
          date={date}
          operationalDayId={data.operationalDayId}
          expenses={data.expenses}
          categories={data.categories}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  )
}

// ─── Expense panel ────────────────────────────────────────────────────────────

interface ExpensePanelProps {
  date: string
  operationalDayId: string
  expenses: Expense[]
  categories: ExpenseCategory[]
  onRefresh: () => void
}

function ExpensePanel({
  date,
  operationalDayId,
  expenses,
  categories,
  onRefresh,
}: ExpensePanelProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-secondary/50 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Gastos del día
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {expenses.length === 0
            ? 'Sin gastos registrados'
            : `${expenses.length} gasto${expenses.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Expense rows */}
      <div className="divide-y divide-border">
        {expenses.map((expense) => (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            categories={categories}
            onRefresh={onRefresh}
          />
        ))}

        {/* Add row */}
        <AddExpenseRow
          date={date}
          operationalDayId={operationalDayId}
          categories={categories}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  )
}

// ─── Single expense row (view + inline edit) ──────────────────────────────────

interface ExpenseRowProps {
  expense: Expense
  categories: ExpenseCategory[]
  onRefresh: () => void
}

function ExpenseRow({ expense, categories, onRefresh }: ExpenseRowProps) {
  const [editing, setEditing] = useState(false)
  const [, startTransition] = useTransition()

  // Edit form state
  const [categoryId, setCategoryId] = useState(expense.expenseCategoryId)
  const [description, setDescription] = useState(expense.description ?? '')
  const [supplier, setSupplier] = useState(expense.supplier ?? '')
  const [sociedad, setSociedad] = useState(expense.sociedad ?? '')
  const [amount, setAmount] = useState(expense.amount.toString())

  function startEdit() {
    setCategoryId(expense.expenseCategoryId)
    setDescription(expense.description ?? '')
    setSupplier(expense.supplier ?? '')
    setSociedad(expense.sociedad ?? '')
    setAmount(expense.amount.toString())
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed < 0) {
      toast.error('Importe inválido')
      return
    }
    if (!categoryId) {
      toast.error('Selecciona una categoría')
      return
    }
    startTransition(async () => {
      const result = await updateExpense(expense.id, {
        expenseCategoryId: categoryId,
        description: description || null,
        supplier: supplier || null,
        sociedad: sociedad || null,
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
    const result = await deleteExpense(expense.id)
    if (result.error) {
      toast.error(result.error)
    } else {
      onRefresh()
    }
  }

  const categoryName =
    categories.find((c) => c.id === expense.expenseCategoryId)?.name ?? '—'

  if (editing) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3 bg-secondary/10">
        {/* Row 1: Category + Amount */}
        <div className="flex items-center gap-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          >
            <option value="">Categoría…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="w-28 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 text-right"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') cancelEdit()
            }}
          />
          <button
            onClick={handleSave}
            className="text-green-600 hover:text-green-700 p-1 rounded transition-colors"
          >
            <Check size={14} />
          </button>
          <button
            onClick={cancelEdit}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        {/* Row 2: Description + Supplier + Sociedad */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción"
            className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Proveedor"
            className="w-32 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="text"
            value={sociedad}
            onChange={(e) => setSociedad(e.target.value)}
            placeholder="Sociedad"
            className="w-28 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-2 group">
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground truncate">
          {categoryName}
        </span>
        {(expense.description || expense.supplier || expense.sociedad) && (
          <span className="text-xs text-muted-foreground truncate">
            {[expense.description, expense.supplier, expense.sociedad]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {euro(expense.amount)}
        </span>
        <button
          onClick={startEdit}
          className="text-muted-foreground hover:text-foreground p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          title="Editar gasto"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={handleDelete}
          className="text-muted-foreground hover:text-destructive p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          title="Eliminar gasto"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Add expense row ──────────────────────────────────────────────────────────

interface AddExpenseRowProps {
  date: string
  operationalDayId: string
  categories: ExpenseCategory[]
  onRefresh: () => void
}

function AddExpenseRow({
  date,
  operationalDayId,
  categories,
  onRefresh,
}: AddExpenseRowProps) {
  const [adding, setAdding] = useState(false)
  const [, startTransition] = useTransition()

  // Form state
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [supplier, setSupplier] = useState('')
  const [sociedad, setSociedad] = useState('')
  const [amount, setAmount] = useState('')

  function resetForm() {
    setCategoryId('')
    setDescription('')
    setSupplier('')
    setSociedad('')
    setAmount('')
  }

  function handleCancel() {
    setAdding(false)
    resetForm()
  }

  function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed < 0) {
      toast.error('Importe inválido')
      return
    }
    if (!categoryId) {
      toast.error('Selecciona una categoría')
      return
    }
    startTransition(async () => {
      const result = await createExpense({
        expenseCategoryId: categoryId,
        operationalDayId,
        incurredOn: date,
        description: description || null,
        supplier: supplier || null,
        sociedad: sociedad || null,
        amount: parsed,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        setAdding(false)
        resetForm()
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
        Añadir gasto
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-t border-dashed border-border/50 bg-secondary/10">
      {/* Row 1: Category + Amount + Actions */}
      <div className="flex items-center gap-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          autoFocus
        >
          <option value="">Categoría…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          className="w-28 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 text-right"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') handleCancel()
          }}
        />
        <button
          onClick={handleSave}
          className="text-green-600 hover:text-green-700 p-1 rounded transition-colors"
        >
          <Check size={14} />
        </button>
        <button
          onClick={handleCancel}
          className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      {/* Row 2: Description + Supplier + Sociedad */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="text"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Proveedor"
          className="w-32 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="text"
          value={sociedad}
          onChange={(e) => setSociedad(e.target.value)}
          placeholder="Sociedad"
          className="w-28 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
    </div>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function DayFinanceTabSkeleton() {
  return (
    <div className="space-y-4 max-w-[880px] mx-auto px-7 py-5">
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
      {/* Revenue panel */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between items-center px-4 py-3 border-b border-border last:border-0">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
      {/* Costs panel */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="flex justify-between items-center px-4 py-3 border-b border-border last:border-0">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
