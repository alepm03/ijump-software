/**
 * /finanzas/catalogo — Product Catalog admin page (Server Component)
 *
 * Fetches all products (including inactive ones so the manager can toggle
 * them) and passes them to the <ProductCatalogManager /> client component.
 */

import Link from 'next/link'
import { listProducts } from '@/lib/actions/finance'
import { ProductCatalogManager } from '@/components/operational/ProductCatalogManager'

export default async function CatalogPage() {
  // Fetch all products including inactive so the client can toggle them
  const products = await listProducts(true)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Breadcrumb / back link */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/finanzas"
            className="hover:text-foreground transition-colors"
          >
            Finanzas
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Catálogo</span>
        </div>

        {/* Page header */}
        <div>
          <h1 className="text-xl font-bold text-foreground">Catálogo de productos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestiona los productos facturables: tándem, cámara, fotos, sobrepeso y más.
          </p>
        </div>

        <ProductCatalogManager initialProducts={products} />
      </div>
    </div>
  )
}
