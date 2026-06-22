import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { countPendingLeads } from '@/lib/actions/leads'

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

  const pendingLeadsCount = await countPendingLeads()

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar email={user.email ?? ''} pendingLeadsCount={pendingLeadsCount} />
      {/* overflow-hidden so each page controls its own scroll — day view keeps summary pinned at bottom */}
      {/* pt-12 on mobile offsets the fixed hamburger button; removed at md+ */}
      <main className="flex-1 overflow-hidden flex flex-col pt-12 md:pt-0">{children}</main>
    </div>
  )
}
