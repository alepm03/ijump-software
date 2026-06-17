import { getFinancialSettings } from '@/lib/actions/finance'
import { FinancialSettingsForm } from '@/components/operational/FinancialSettingsForm'

export default async function AdminPage() {
  const settings = await getFinancialSettings()

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Configuración</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Precios base y parámetros financieros del centro.
          </p>
        </div>
        <FinancialSettingsForm settings={settings} />
      </div>
    </div>
  )
}
