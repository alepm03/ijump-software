'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateFinancialSettings } from '@/lib/actions/finance'
import type { FinancialSettings } from '@/types/domain'

interface Props {
  settings: FinancialSettings
}

interface FieldProps {
  label: string
  description: string
  value: number
  onSave: (v: number) => Promise<void>
}

function PriceField({ label, description, value, onSave }: FieldProps) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [, startTransition] = useTransition()

  function handleEdit() {
    setInputVal(value.toString())
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setInputVal('')
  }

  function handleSave() {
    const parsed = parseFloat(inputVal.replace(',', '.'))
    if (isNaN(parsed) || parsed < 0) {
      toast.error('Valor inválido')
      return
    }
    startTransition(async () => {
      await onSave(parsed)
      setEditing(false)
    })
  }

  return (
    <div className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        {editing ? (
          <>
            <input
              type="number"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
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
            <span className="text-sm font-semibold text-foreground min-w-[80px] text-right">
              {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)}
            </span>
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

export function FinancialSettingsForm({ settings }: Props) {
  const router = useRouter()

  async function save(field: string, value: number) {
    const result = await updateFinancialSettings({ [field]: value })
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Precio actualizado')
      router.refresh()
    }
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-secondary/50 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Precios base
        </span>
      </div>
      <div className="px-4">
        <PriceField
          label="Gasolina por vuelo"
          description="Coste de combustible por cada vuelo realizado"
          value={settings.fuelPricePerFlight}
          onSave={(v) => save('fuelPricePerFlight', v)}
        />
        <PriceField
          label="Hangar por día"
          description="Coste fijo de hangar por jornada operacional"
          value={settings.hangarPricePerDay}
          onSave={(v) => save('hangarPricePerDay', v)}
        />
        <PriceField
          label="Plegador por salto"
          description="Fee del plegador por cada salto realizado"
          value={settings.packerFeePerJump}
          onSave={(v) => save('packerFeePerJump', v)}
        />
      </div>
    </div>
  )
}
