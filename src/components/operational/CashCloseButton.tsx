'use client'

/**
 * CashCloseButton — Sprint 2 treasury. Mounted next to <DayHeader> in
 * DayManifest.tsx (see that file — DayHeader.tsx itself is untouched).
 * Loads the closed/open state itself so DayManifest doesn't need to fetch
 * cash-close data server-side just for this button's label.
 */

import { useEffect, useState } from 'react'
import { Check, Wallet } from 'lucide-react'
import { getCashCloseSummary } from '@/lib/actions/finance'
import { CashCloseModal } from './CashCloseModal'

export function CashCloseButton({ operationalDayId }: { operationalDayId: string }) {
  const [closed, setClosed] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCashCloseSummary(operationalDayId)
      .then((data) => {
        if (!cancelled) setClosed(data.closed)
      })
      .catch(() => {
        if (!cancelled) setClosed(false)
      })
    return () => {
      cancelled = true
    }
  }, [operationalDayId])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 text-xs font-semibold h-7 px-2.5 rounded-[7px] border transition-colors flex-shrink-0 ${
          closed
            ? 'bg-weather-ok-bg border-state-success text-weather-ok'
            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
        }`}
      >
        {closed ? <Check size={13} /> : <Wallet size={13} />}
        {closed ? 'Caja cerrada' : 'Cerrar caja'}
      </button>

      <CashCloseModal
        operationalDayId={operationalDayId}
        open={open}
        onOpenChange={setOpen}
        onClosed={() => setClosed(true)}
      />
    </>
  )
}
