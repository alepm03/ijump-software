/**
 * /administracion/caja — Recent cash closes (Server Component). Sprint 2
 * treasury. Same shell pattern as /administracion (Sprint 1's Cobros page).
 */

import { listCashCloses } from '@/lib/actions/finance'
import { CashCloseView } from '@/components/operational/CashCloseView'
import { AdministracionNav } from '@/components/operational/AdministracionNav'

export default async function CajaPage() {
  const cashCloses = await listCashCloses()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AdministracionNav active="caja" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto w-full">
          <CashCloseView cashCloses={cashCloses} />
        </div>
      </div>
    </div>
  )
}
