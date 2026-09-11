import Link from 'next/link'

/**
 * Tab bar for /administracion. "P&L" links out to the existing /finanzas
 * page (accrual P&L, untouched by Sprint 1) rather than duplicating it here
 * — see docs/act-as-como-mi-co-ceo-co-cto-reactive-kite.md §Área de UI.
 * "Caja" (Sprint 2 treasury) lists recent cash closes. Pagos/Bonos tabs are
 * NOT rendered yet (later sprints).
 */

const TABS = [
  { id: 'cobros', label: 'Cobros', href: '/administracion' },
  { id: 'caja', label: 'Caja', href: '/administracion/caja' },
  { id: 'pnl', label: 'P&L', href: '/finanzas' },
] as const

export function AdministracionNav({ active }: { active: 'cobros' | 'caja' | 'pnl' }) {
  return (
    <div className="bg-card border-b border-border px-6 flex items-center gap-1 flex-shrink-0">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={`px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === tab.id
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
