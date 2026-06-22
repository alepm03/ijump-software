'use client'

/**
 * SaleChannelsForm — inline editor for sale_channels.commission_pct on the
 * PLATFORM channels (Groupon, Smartbox, Wonder Box, Jumping, Freedom).
 *
 * DIRECT channels (Reserva directa, Bono, Promo) carry no commission, so they
 * are shown read-only as context, not edited.
 *
 * UX: Editar → input (%) → Guardar / Cancelar (same pattern as ExpenseCategoryRatesForm).
 * Design: semantic tokens only (bg-card, bg-background, border-border, etc.).
 * No dark mode, no hardcoded colors.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateSaleChannelCommission } from '@/lib/actions/finance'
import type { SaleChannel } from '@/types/domain'

// ─── Percentage formatter ──────────────────────────────────────────────────────

function pct(value: number): string {
  const [i, d] = value.toFixed(2).split('.')
  return `${i},${d} %`
}

// ─── Single platform channel field ─────────────────────────────────────────────

interface ChannelFieldProps {
  channel: SaleChannel
  onSaved: () => void
}

function ChannelField({ channel, onSaved }: ChannelFieldProps) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [, startTransition] = useTransition()

  function handleEdit() {
    setInputVal(channel.commissionPct !== null ? channel.commissionPct.toString() : '')
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setInputVal('')
  }

  function handleSave() {
    const trimmed = inputVal.trim()
    // Allow clearing the rate back to null (pending) by submitting an empty string
    const newPct = trimmed === '' ? null : parseFloat(trimmed.replace(',', '.'))

    if (newPct !== null && (isNaN(newPct) || newPct < 0 || newPct > 100)) {
      toast.error('Introduce un porcentaje entre 0 y 100')
      return
    }

    startTransition(async () => {
      const result = await updateSaleChannelCommission(channel.id, newPct)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Comisión actualizada')
        setEditing(false)
        onSaved()
      }
    })
  }

  return (
    <div className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
      {/* Label + note */}
      <div>
        <div className="text-sm font-medium text-foreground">{channel.name}</div>
        {channel.notes && (
          <div className="text-xs text-muted-foreground mt-0.5">{channel.notes}</div>
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
              min={0}
              max={100}
              step="0.01"
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
              {channel.commissionPct !== null
                ? pct(channel.commissionPct)
                : <span className="text-muted-foreground font-normal">Pendiente</span>}
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

// ─── Main export ───────────────────────────────────────────────────────────────

interface Props {
  channels: SaleChannel[]
}

export function SaleChannelsForm({ channels }: Props) {
  const router = useRouter()

  const platforms = channels.filter((c) => c.active && c.channelKind === 'PLATFORM')
  const directs = channels.filter((c) => c.active && c.channelKind === 'DIRECT')

  if (platforms.length === 0) {
    return (
      <div className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No hay plataformas de venta configuradas.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-secondary/50 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Comisión por plataforma
        </span>
      </div>
      <div className="px-4">
        {platforms.map((channel) => (
          <ChannelField
            key={channel.id}
            channel={channel}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>
      {directs.length > 0 && (
        <div className="px-4 py-2.5 bg-background border-t border-border text-xs text-muted-foreground">
          Canales directos sin comisión: {directs.map((d) => d.name).join(', ')}.
        </div>
      )}
    </div>
  )
}
