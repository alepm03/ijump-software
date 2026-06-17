import { getMonthFinancialsDetail } from '@/lib/actions/finance'
import { FinanceMonthDetail } from '@/components/operational/FinanceMonthDetail'
import { notFound } from 'next/navigation'

export default async function FinanceMonthDetailPage({
  params,
}: {
  params: Promise<{ month: string }>
}) {
  const { month } = await params

  // Validate YYYY-MM format
  if (!/^\d{4}-\d{2}$/.test(month)) notFound()

  const detail = await getMonthFinancialsDetail(month)

  return (
    <div className="flex-1 overflow-y-auto">
      <FinanceMonthDetail detail={detail} />
    </div>
  )
}
