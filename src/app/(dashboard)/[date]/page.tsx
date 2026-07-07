import { getOperationalDay } from '@/lib/actions/operational-day'
import { getInstructors } from '@/lib/actions/instructor'
import { getPolicy } from '@/lib/actions/availability'
import { DayManifest } from '@/components/operational/DayManifest'
import { EmptyDayState } from '@/components/operational/EmptyDayState'

export default async function DayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>
  searchParams: Promise<{ highlight?: string }>
}) {
  const { date } = await params
  // Deep-link from /reservas ("Manifest" button on a confirmed lead):
  // scrolls to and briefly highlights this participant's row.
  const { highlight } = await searchParams
  const [day, instructors, policy] = await Promise.all([
    getOperationalDay(date),
    getInstructors(true),
    getPolicy(),
  ])

  if (!day) return <EmptyDayState date={date} />

  return <DayManifest day={day} instructors={instructors} policy={policy} highlightId={highlight ?? null} />
}
