import { logout } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-white tracking-tight">iJump</span>
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:text-white"
          >
            Salir
          </Button>
        </form>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
