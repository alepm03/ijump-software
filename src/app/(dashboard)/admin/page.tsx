import { listExpenseCategories } from '@/lib/actions/finance'
import { ExpenseCategoryRatesForm } from '@/components/operational/ExpenseCategoryRatesForm'

export default async function AdminPage() {
  const categories = await listExpenseCategories()

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
      </div>
    </div>
  )
}
