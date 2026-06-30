'use client'

/**
 * ExpenseCategoryRatesForm — inline editor for expense_categories.default_rate
 * on the auto-calculated cost categories (those with a non-null rateBasis).
 *
 * Shows: category name, rate_basis label, current default_rate.
 * UX: pencil → input → Guardar / Cancelar (same pattern as FinancialSettingsForm).
 *
 * Design: semantic tokens only (bg-card, bg-background, border-border, etc.).
 * No dark mode, no hardcoded colors.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateExpenseCategoryRate } from '@/lib/actions/finance'
import type { ExpenseCategory, RateBasis } from '@/types/domain'

// ─── Currency formatter ────────────────────────────────────────────────────────

function euro(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const [i, d] = Math.abs(amount).toFixed(2).split('.')
  return `${sign}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d} €`
}

// ─── Rate basis labels ─────────────────────────────────────────────────────────

const RATE_BASIS_LABELS: Record<RateBasis, string> = {
  PER_FLIGHT:      'por vuelo',
  PER_JUMP:        'por salto',
  FIXED_PER_DAY:   'por día',
  FIXED_PER_MONTH: 'por mes',
}

// ─── Single category field ─────────────────────────────────────────────────────

interface CategoryFieldProps {
  category: ExpenseCategory
  onSaved: () => void
}

function CategoryField({ category, onSaved }: CategoryFieldProps) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [, startTransition] = useTransition()

  const rateBasisLabel =
    category.rateBasis ? RATE_BASIS_LABELS[category.rateBasis] : ''

  function handleEdit() {
    setInputVal(category.defaultRate !== null ? category.defaultRate.toString() : '')
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setInputVal('')
  }

  function handleSave() {
    const trimmed = inputVal.trim()
    // Allow clearing the rate to null by submitting an empty string
    const newRate = trimmed === '' ? null : parseFloat(trimmed.replace(',', '.'))

    if (newRate !== null && (isNaN(newRate) || newRate < 0)) {
      toast.error('Valor inválido')
      return
    }

    startTransition(async () => {
      const result = await updateExpenseCategoryRate(category.id, newRate)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Tarifa actualizada')
        setEditing(false)
        onSaved()
      }
    })
  }

  return (
    <div className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
      {/* Label + basis */}
      <div>
        <div className="text-sm font-medium text-foreground">{category.name}</div>
        {rateBasisLabel && (
          <div className="text-xs text-muted-foreground mt-0.5">
            Tarifa {rateBasisLabel}
          </div>
        )}
      </div>

      {/* Value + actions */}
      <div className="flex items-center gap-2 ml-4">
        {editing ? (
          <>
            <input
              type="number"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
              placeholder="0,00"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') handleCancel()
              }}
            />
            <button
              onClick={handleSave}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition"
            >
              Guardar
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-foreground min-w-[80px] text-right tabular-nums">
              {category.defaultRate !== null
                ? euro(category.defaultRate)
                : <span className="text-muted-foreground font-normal">Sin tarifa</span>}
            </span>
            {rateBasisLabel && category.defaultRate !== null && (
              <span className="text-xs text-muted-foreground">/ {rateBasisLabel.split(' ')[1]}</span>
            )}
            <button
              onClick={handleEdit}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition"
            >
              Editar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────

interface Props {
  categories: ExpenseCategory[]
}

export function ExpenseCategoryRatesForm({ categories }: Props) {
  const router = useRouter()

  // Only show categories that have a rateBasis (auto-calculated ones)
  const autoCategories = categories.filter((c) => c.rateBasis !== null && c.active)

  if (autoCategories.length === 0) {
    return (
      <div className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No hay categorías de gasto con tarifa automática configuradas.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-secondary/50 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Tarifas automáticas de gasto
        </span>
      </div>
      <div className="px-4">
        {autoCategories.map((cat) => (
          <CategoryField
            key={cat.id}
            category={cat}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  )
}
