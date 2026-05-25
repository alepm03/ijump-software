import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { getOperationalDaysWithStats } from '@/lib/actions/operational-day'
import { CalendarView } from '@/components/operational/CalendarView'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: monthParam } = await searchParams
  const month = monthParam ?? format(new Date(), 'yyyy-MM')

  const monthDate = parseISO(`${month}-01`)
  const from = format(startOfMonth(monthDate), 'yyyy-MM-dd')
  const to = format(endOfMonth(monthDate), 'yyyy-MM-dd')

  const days = await getOperationalDaysWithStats(from, to)

  return <CalendarView month={month} days={days} />
}
