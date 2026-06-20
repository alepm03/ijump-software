'use client'

/**
 * ProductCatalogManager — inline CRUD for the products table.
 *
 * Features:
 *   • Table: code, name, category label, base price, active status
 *   • Inline create row (code + name + category select + base_price)
 *   • Inline edit of name + base_price via pencil → input → save/cancel
 *   • Activate / deactivate toggle
 *   • Show-inactive toggle
 *
 * Design: mirrors FinancePnlView card surfaces and InstructorsManager
 * inline-edit UX. Semantic tokens only. No hardcoded colors.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  createProduct,
  updateProduct,
  setProductActive,
} from '@/lib/actions/finance'
import type { Product, ProductCategory } from '@/types/domain'

// ─── Currency formatter ────────────────────────────────────────────────────────

function euro(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const [i, d] = Math.abs(amount).toFixed(2).split('.')
  return `${sign}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d} €`
}

// ─── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  TANDEM_BASE:     'Tándem base',
  CAMERA_HANDYCAM: 'Handycam',
  CAMERA_EXTERNAL: 'Cámara externa',
  PHOTOS:          'Fotos',
  OVERWEIGHT:      'Sobrepeso (OW)',
  GROUND_REPORT:   'Reportaje en tierra',
  OTHER:           'Otros',
}

const CATEGORY_ORDER: ProductCategory[] = [
  'TANDEM_BASE',
  'CAMERA_HANDYCAM',
  'CAMERA_EXTERNAL',
  'PHOTOS',
  'OVERWEIGHT',
  'GROUND_REPORT',
  'OTHER',
]

// ─── Shared input class ────────────────────────────────────────────────────────

const inputCls =
  'rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30'

// ─── Create row ────────────────────────────────────────────────────────────────

interface CreateRowProps {
  onCreated: () => void
  onCancel: () => void
}

function CreateRow({ onCreated, onCancel }: CreateRowProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ProductCategory>('TANDEM_BASE')
  const [price, setPrice] = useState('')
  const [, startTransition] = useTransition()

  function handleSave() {
    const trimCode = code.trim()
    const trimName = name.trim()
    const parsed = parseFloat(price.replace(',', '.'))

    if (!trimCode) { toast.error('El código es obligatorio'); return }
    if (!trimName) { toast.error('El nombre es obligatorio'); return }
    if (isNaN(parsed) || parsed < 0) { toast.error('Precio inválido'); return }

    startTransition(async () => {
      const result = await createProduct({
        code: trimCode,
        name: trimName,
        category,
        basePrice: parsed,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Producto "${trimName}" creado`)
        onCreated()
      }
    })
  }

  return (
    <tr className="bg-card border-b border-border last:border-b-0">
      <td className="px-3 py-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código"
          className={`${inputCls} w-24`}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del producto"
          className={`${inputCls} w-52`}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ProductCategory)}
          className={`${inputCls} w-44`}
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0,00"
          className={`${inputCls} w-28 text-right`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') onCancel()
          }}
        />
      </td>
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSave}
            className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition"
          >
            Guardar
          </button>
          <button
            onClick={onCancel}
            className="px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition"
          >
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Product row ───────────────────────────────────────────────────────────────

interface ProductRowProps {
  product: Product
  onRefresh: () => void
}

function ProductRow({ product, onRefresh }: ProductRowProps) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState('')
  const [priceVal, setPriceVal] = useState('')
  const [toggling, setToggling] = useState(false)
  const [, startTransition] = useTransition()

  function openEdit() {
    setNameVal(product.name)
    setPriceVal(product.basePrice.toString())
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setNameVal('')
    setPriceVal('')
  }

  function handleSave() {
    const trimName = nameVal.trim()
    const parsed = parseFloat(priceVal.replace(',', '.'))

    if (!trimName) { toast.error('El nombre es obligatorio'); return }
    if (isNaN(parsed) || parsed < 0) { toast.error('Precio inválido'); return }

    startTransition(async () => {
      const result = await updateProduct(product.id, { name: trimName, basePrice: parsed })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Producto actualizado')
        setEditing(false)
        onRefresh()
      }
    })
  }

  async function handleToggle() {
    setToggling(true)
    const result = await setProductActive(product.id, !product.active)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(product.active ? 'Producto desactivado' : 'Producto activado')
      onRefresh()
    }
    setToggling(false)
  }

  return (
    <tr
      className={`border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors ${
        !product.active ? 'opacity-50' : ''
      }`}
    >
      {/* Code */}
      <td className="px-3 py-2.5">
        <span className="text-xs font-mono font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
          {product.code}
        </span>
      </td>

      {/* Name — inline edit */}
      <td className="px-3 py-2.5">
        {editing ? (
          <input
            type="text"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            className={`${inputCls} w-52`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') cancelEdit()
            }}
          />
        ) : (
          <span className="text-sm font-medium text-foreground">{product.name}</span>
        )}
      </td>

      {/* Category */}
      <td className="px-3 py-2.5">
        <span className="text-sm text-muted-foreground">
          {CATEGORY_LABELS[product.category]}
        </span>
      </td>

      {/* Base price — inline edit */}
      <td className="px-3 py-2.5 text-right">
        {editing ? (
          <input
            type="number"
            value={priceVal}
            onChange={(e) => setPriceVal(e.target.value)}
            className={`${inputCls} w-28 text-right`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') cancelEdit()
            }}
          />
        ) : (
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {euro(product.basePrice)}
          </span>
        )}
      </td>

      {/* Active badge */}
      <td className="px-3 py-2.5 text-center">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            product.active
              ? 'bg-green-50 text-green-700'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          {product.active ? 'Activo' : 'Inactivo'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 justify-end">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition"
              >
                Guardar
              </button>
              <button
                onClick={cancelEdit}
                className="px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={openEdit}
                className="px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                title="Editar nombre y precio"
              >
                ✎ Editar
              </button>
              <button
                onClick={handleToggle}
                disabled={toggling}
                className="px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition disabled:opacity-50"
              >
                {toggling ? '...' : product.active ? 'Desactivar' : 'Activar'}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  initialProducts: Product[]
}

export function ProductCatalogManager({ initialProducts }: Props) {
  const router = useRouter()
  const [showInactive, setShowInactive] = useState(false)
  const [adding, setAdding] = useState(false)

  const visible = showInactive
    ? initialProducts
    : initialProducts.filter((p) => p.active)

  const inactiveCount = initialProducts.filter((p) => !p.active).length

  function refresh() {
    router.refresh()
  }

  function handleCreated() {
    setAdding(false)
    refresh()
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition"
          >
            <span className="text-lg leading-none">+</span>
            Añadir producto
          </button>
        ) : (
          <div /> /* placeholder so justify-between keeps toggle right */
        )}

        {inactiveCount > 0 && (
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition"
          >
            {showInactive
              ? 'Ocultar inactivos'
              : `Mostrar inactivos (${inactiveCount})`}
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {/* Panel header */}
        <div className="px-4 py-2.5 bg-secondary/50 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Catálogo de productos · {visible.length} {visible.length === 1 ? 'producto' : 'productos'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground w-24">
                  Código
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  Nombre
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground w-44">
                  Categoría
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground w-32">
                  Precio base
                </th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground w-20">
                  Estado
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground w-40">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Inline create row */}
              {adding && (
                <CreateRow
                  onCreated={handleCreated}
                  onCancel={() => setAdding(false)}
                />
              )}

              {/* Product rows */}
              {visible.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  onRefresh={refresh}
                />
              ))}

              {/* Empty state */}
              {visible.length === 0 && !adding && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No hay productos
                    {!showInactive && inactiveCount > 0 ? ' activos. Muestra los inactivos para verlos.' : '.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
