import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/layout/AppSidebar'

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
    <div className="flex h-screen bg-background">
      <AppSidebar email={user.email ?? ''} />
      {/* overflow-hidden so each page controls its own scroll — day view keeps summary pinned at bottom */}
      <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
    </div>
  )
}
