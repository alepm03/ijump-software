import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { countLeadAttention } from '@/lib/actions/leads'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // Parallel on purpose: countPendingLeads without a session just returns 0
  // (RLS blocks anon), so it never leaks data when the redirect below fires.
  const [
    {
      data: { user },
    },
    pendingLeadsCount,
  ] = await Promise.all([supabase.auth.getUser(), countPendingLeads()])

  if (!user) redirect('/login')

  const leadAttention = await countLeadAttention()

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AppSidebar
        email={user.email ?? ''}
        pendingLeadsCount={leadAttention.pending}
        coldLeadsCount={leadAttention.cold}
      />
      {/* overflow-hidden so each page controls its own scroll — day view keeps summary pinned at bottom */}
      {/* pt-12 on mobile offsets the fixed hamburger button; removed at md+ */}
      <main className="flex-1 overflow-hidden flex flex-col pt-12 md:pt-0">{children}</main>
    </div>
  )
}
