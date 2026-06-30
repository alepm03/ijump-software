import { listExpenseCategories, listSaleChannels } from '@/lib/actions/finance'
import { ExpenseCategoryRatesForm } from '@/components/operational/ExpenseCategoryRatesForm'
import { SaleChannelsForm } from '@/components/operational/SaleChannelsForm'

export default async function AdminPage() {
  const [categories, saleChannels] = await Promise.all([
    listExpenseCategories(),
    listSaleChannels(),
  ])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Configuración</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tarifas de coste por categoría del centro.
          </p>
        </div>

        {/* Finance v2 — auto-calculated expense category rates */}
        <ExpenseCategoryRatesForm categories={categories} />

        {/* Finance — per-channel sale commissions */}
        <div className="pt-2">
          <h2 className="text-base font-semibold text-foreground">Canales de venta y comisiones</h2>
          <p className="text-sm text-muted-foreground mt-0.5 mb-3">
            Registro de la comisión de cada plataforma de venta. Los ingresos de plataforma
            (Groupon, Smartbox, etc.) llegan ya netos: la plataforma descuenta su comisión antes
            de pagar, por lo que este porcentaje es solo informativo y no se resta del P&L.
          </p>
          <SaleChannelsForm channels={saleChannels} />
        </div>
      </div>
    </div>
  )
}
