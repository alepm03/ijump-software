import { getOperationalDay } from '@/lib/actions/operational-day'
import { getInstructors } from '@/lib/actions/instructor'
import { DayManifest } from '@/components/operational/DayManifest'
import { EmptyDayState } from '@/components/operational/EmptyDayState'

export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  const [day, instructors] = await Promise.all([
    getOperationalDay(date),
    getInstructors(true),
  ])

  if (!day) return <EmptyDayState date={date} />

  return <DayManifest day={day} instructors={instructors} />
}
