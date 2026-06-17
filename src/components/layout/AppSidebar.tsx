'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, Sun, Users, TrendingUp, Settings } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { logout } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'

interface AppSidebarProps {
  email: string
}

export function AppSidebar({ email }: AppSidebarProps) {
  const pathname = usePathname()

  const today = format(new Date(), 'yyyy-MM-dd')
  const todayLabel = `Hoy · ${format(new Date(), "d MMM", { locale: es })}`

  const isCalendar = pathname === '/' || pathname.startsWith('/?')
  const isToday = pathname === `/${today}`
  const isFinanzas = pathname.startsWith('/finanzas')
  const isInstructors = pathname.startsWith('/admin/instructors')
  const isAdmin = pathname === '/admin'

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border h-full" style={{ background: 'var(--sidebar)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-[18px] border-b border-border">
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary)' }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="white" aria-hidden="true">
            <path d="M10 2C6 2 2 6 2 10c0 2.5 1.2 4.7 3 6.1L10 18l5-1.9C16.8 14.7 18 12.5 18 10c0-4-4-8-8-8z" opacity="0.9"/>
            <circle cx="10" cy="10" r="2.5" fill="rgba(255,255,255,0.9)"/>
          </svg>
        </div>
        <span className="font-bold text-title text-foreground" style={{ letterSpacing: '-0.4px' }}>iJump</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 pt-2 space-y-0.5">
        <Link
          href="/"
          className="flex items-center gap-[9px] w-full px-2.5 py-[7px] rounded-[7px] text-sm transition-colors"
          style={{
            background: isCalendar ? 'var(--brand-light, oklch(0.957 0.038 55))' : 'transparent',
            color: isCalendar ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: isCalendar ? 600 : 400,
          }}
        >
          <Calendar size={14} />
          Calendario
        </Link>

        <Link
          href={`/${today}`}
          className="flex items-center gap-[9px] w-full px-2.5 py-[7px] rounded-[7px] text-sm transition-colors"
          style={{
            background: isToday ? 'var(--brand-light, oklch(0.957 0.038 55))' : 'transparent',
            color: isToday ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: isToday ? 600 : 400,
          }}
        >
          <Sun size={14} />
          {todayLabel}
        </Link>

        <Link
          href="/finanzas"
          className="flex items-center gap-[9px] w-full px-2.5 py-[7px] rounded-[7px] text-sm transition-colors"
          style={{
            background: isFinanzas ? 'var(--brand-light, oklch(0.957 0.038 55))' : 'transparent',
            color: isFinanzas ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: isFinanzas ? 600 : 400,
          }}
        >
          <TrendingUp size={14} />
          Finanzas
        </Link>

        <div className="my-1.5 border-t border-border/50" />

        <Link
          href="/admin/instructors"
          className="flex items-center gap-[9px] w-full px-2.5 py-[7px] rounded-[7px] text-sm transition-colors"
          style={{
            background: isInstructors ? 'var(--brand-light, oklch(0.957 0.038 55))' : 'transparent',
            color: isInstructors ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: isInstructors ? 600 : 400,
          }}
        >
          <Users size={14} />
          Instructores
        </Link>

        <Link
          href="/admin"
          className="flex items-center gap-[9px] w-full px-2.5 py-[7px] rounded-[7px] text-sm transition-colors"
          style={{
            background: isAdmin ? 'var(--brand-light, oklch(0.957 0.038 55))' : 'transparent',
            color: isAdmin ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: isAdmin ? 600 : 400,
          }}
        >
          <Settings size={14} />
          Configuración
        </Link>
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm text-foreground font-medium truncate">Admin</div>
            <div className="text-xs text-muted-foreground truncate">{email}</div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border bg-transparent transition-colors"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
