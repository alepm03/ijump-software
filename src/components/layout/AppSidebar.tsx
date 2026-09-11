'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Calendar, Sun, Users, TrendingUp, Settings, Menu, ClipboardList, Wallet } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { logout } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'

interface AppSidebarProps {
  email: string
  pendingLeadsCount?: number
  /** Cold subset (>48h without contact) — escalates the badge to alert red. */
  coldLeadsCount?: number
}

const NAV_GROUPS = (today: string, todayLabel: string) => [
  [
    { href: '/', label: 'Calendario', icon: Calendar, matchFn: (p: string) => p === '/' || p.startsWith('/?') },
    { href: `/${today}`, label: todayLabel, icon: Sun, matchFn: (p: string) => p === `/${today}` },
    { href: '/reservas', label: 'Reservas', icon: ClipboardList, matchFn: (p: string) => p.startsWith('/reservas') },
  ],
  [
    { href: '/finanzas', label: 'Finanzas', icon: TrendingUp, matchFn: (p: string) => p.startsWith('/finanzas') },
    { href: '/administracion', label: 'Administración', icon: Wallet, matchFn: (p: string) => p.startsWith('/administracion') },
  ],
  [
    { href: '/admin/instructors', label: 'Instructores', icon: Users, matchFn: (p: string) => p.startsWith('/admin/instructors') },
    { href: '/admin', label: 'Configuración', icon: Settings, matchFn: (p: string) => p === '/admin' },
  ],
]

// ─── Shared nav link — used in both sidebar variants ──────────────────────────

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  collapsed,
  badgeCount,
  badgeUrgent,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  isActive: boolean
  collapsed?: boolean
  badgeCount?: number
  /** Alert style (cold leads waiting): destructive red instead of brand orange. */
  badgeUrgent?: boolean
}) {
  const showBadge = !!badgeCount && badgeCount > 0
  const badgeColor = badgeUrgent
    ? 'bg-destructive text-primary-foreground'
    : 'bg-primary text-primary-foreground'

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-[9px] w-full rounded-[7px] text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
        collapsed ? 'justify-center px-2 py-[7px]' : 'px-2.5 py-[7px]'
      } ${
        isActive
          ? 'bg-secondary text-primary font-semibold'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
      }`}
    >
      <span className="relative flex-shrink-0">
        <Icon size={14} />
        {showBadge && collapsed && (
          <span className={`absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full ${badgeColor} text-[0.5625rem] font-bold flex items-center justify-center leading-none`}>
            {badgeCount}
          </span>
        )}
      </span>
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && showBadge && (
        <span className={`min-w-[18px] h-[18px] px-1 rounded-full ${badgeColor} text-[0.625rem] font-bold flex items-center justify-center leading-none flex-shrink-0`}>
          {badgeCount}
        </span>
      )}
    </Link>
  )
}

// ─── Sidebar inner content — reused for both desktop and mobile sheet ─────────

function SidebarContent({
  pathname,
  today,
  todayLabel,
  email,
  collapsed = false,
  pendingLeadsCount = 0,
  coldLeadsCount = 0,
}: {
  pathname: string
  today: string
  todayLabel: string
  email: string
  collapsed?: boolean
  pendingLeadsCount?: number
  coldLeadsCount?: number
}) {
  const navGroups = NAV_GROUPS(today, todayLabel)

  return (
    <>
      {/* Logo */}
      <div
        className={`flex items-center border-b border-border flex-shrink-0 ${
          collapsed ? 'justify-center px-2 py-[18px]' : 'gap-2.5 px-4 py-[18px]'
        }`}
      >
        <div className="w-[30px] h-[30px] rounded-lg overflow-hidden flex-shrink-0">
          <Image
            src="/logo-ijump.png"
            alt="iJump Skydive"
            width={30}
            height={30}
            className="w-full h-full object-cover"
            priority
          />
        </div>
        {!collapsed && (
          <span className="font-bold text-title text-foreground" style={{ letterSpacing: '-0.4px' }}>
            iJump
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 pt-2">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            {groupIdx > 0 && (
              <div className="my-2 border-t border-border/40" />
            )}
            <div className="space-y-0.5">
              {group.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={item.matchFn(pathname)}
                  collapsed={collapsed}
                  badgeCount={item.href === '/reservas' ? pendingLeadsCount : undefined}
                  badgeUrgent={item.href === '/reservas' && coldLeadsCount > 0}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User + Logout */}
      <div className={`border-t border-border ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
        {collapsed ? (
          <form action={logout} className="flex justify-center">
            <button
              type="submit"
              title="Cerrar sesión"
              className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-md border border-border bg-transparent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              ↩
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm text-foreground font-medium truncate">Admin</div>
              <div className="text-xs text-muted-foreground truncate">{email}</div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border bg-transparent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                Salir
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  )
}

// ─── AppSidebar — responsive: xl=full, md=icon rail, base=hamburger+Sheet ─────

export function AppSidebar({ email, pendingLeadsCount = 0, coldLeadsCount = 0 }: AppSidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')
  const todayLabel = `Hoy · ${format(new Date(), 'd MMM', { locale: es })}`

  return (
    <>
      {/* ── Mobile hamburger button (base / <md) ── */}
      <div className="md:hidden fixed top-3 left-3 z-40">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu size={16} />
        </Button>
      </div>

      {/* ── Mobile Sheet (base) ── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton className="w-56 p-0 flex flex-col gap-0">
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <SidebarContent
            pathname={pathname}
            today={today}
            todayLabel={todayLabel}
            email={email}
            collapsed={false}
            pendingLeadsCount={pendingLeadsCount}
            coldLeadsCount={coldLeadsCount}
          />
        </SheetContent>
      </Sheet>

      {/* ── Tablet icon rail (md to lg) ── */}
      <aside
        className="hidden md:flex xl:hidden flex-shrink-0 flex-col border-r border-border h-full"
        style={{ width: '64px', background: 'var(--sidebar)' }}
      >
        <SidebarContent
          pathname={pathname}
          today={today}
          todayLabel={todayLabel}
          email={email}
          collapsed={true}
          pendingLeadsCount={pendingLeadsCount}
          coldLeadsCount={coldLeadsCount}
        />
      </aside>

      {/* ── Desktop full sidebar (xl+) ── */}
      <aside
        className="hidden xl:flex w-56 flex-shrink-0 flex-col border-r border-border h-full"
        style={{ background: 'var(--sidebar)' }}
      >
        <SidebarContent
          pathname={pathname}
          today={today}
          todayLabel={todayLabel}
          email={email}
          collapsed={false}
          pendingLeadsCount={pendingLeadsCount}
          coldLeadsCount={coldLeadsCount}
        />
      </aside>
    </>
  )
}
