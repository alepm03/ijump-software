'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar } from 'lucide-react'
import { logout } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'

interface AppSidebarProps {
  email: string
}

export function AppSidebar({ email }: AppSidebarProps) {
  const pathname = usePathname()
  const isCalendar = pathname === '/' || pathname.startsWith('/?')

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-sidebar h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 1 C7 1 3 4 3 7.5 C3 9.5 4.5 11 7 11 C9.5 11 11 9.5 11 7.5 C11 4 7 1 7 1Z"
              fill="white"
              fillOpacity="0.9"
            />
            <circle cx="7" cy="12.5" r="1" fill="white" fillOpacity="0.6" />
          </svg>
        </div>
        <span className="font-semibold text-foreground tracking-tight text-sm">iJump</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        <Link
          href="/"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
            isCalendar
              ? 'bg-secondary text-primary font-semibold'
              : 'text-foreground/70 hover:bg-secondary/60 hover:text-foreground'
          }`}
        >
          <Calendar size={15} />
          Calendario
        </Link>
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground truncate mb-2 px-1">{email}</p>
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-muted-foreground hover:text-foreground h-7"
          >
            Cerrar sesión
          </Button>
        </form>
      </div>
    </aside>
  )
}
