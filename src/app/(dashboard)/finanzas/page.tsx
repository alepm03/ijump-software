import { getMonthFinancials, getInstructorPayouts } from '@/lib/actions/finance'
import { FinanceMonthView } from '@/components/operational/FinanceMonthView'
import { format } from 'date-fns'

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: monthParam } = await searchParams
  const month = monthParam ?? format(new Date(), 'yyyy-MM')

  const [summary, instructorPayouts] = await Promise.all([
    getMonthFinancials(month),
    getInstructorPayouts(month),
  ])

  return (
    <div className="flex-1 overflow-y-auto">
      <FinanceMonthView
        month={month}
        summary={summary}
        instructorPayouts={instructorPayouts}
      />
    </div>
  )
}
