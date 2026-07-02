/**
 * /administracion — Treasury hub (Server Component).
 *
 * Sprint 1 ships only the "Cobros" (AR) view here. "P&L" is a link out to
 * the existing /finanzas (accrual P&L, unchanged). Caja/Pagos tabs are
 * intentionally NOT built yet — they land in later sprints (see
 * docs/act-as-como-mi-co-ceo-co-cto-reactive-kite.md §Sprints).
 */

import { getArSummary } from '@/lib/actions/finance'
import { ArCobrosView } from '@/components/operational/ArCobrosView'
import { AdministracionNav } from '@/components/operational/AdministracionNav'

export default async function AdministracionPage() {
  const ar = await getArSummary()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AdministracionNav active="cobros" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto w-full">
          <ArCobrosView ar={ar} />
        </div>
      </div>
    </div>
  )
}
