import { notFound } from 'next/navigation'
import { getOperationalDay } from '@/lib/actions/operational-day'
import { getInstructors } from '@/lib/actions/instructor'
import { DayManifest } from '@/components/operational/DayManifest'

export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  const [day, instructors] = await Promise.all([
    getOperationalDay(date),
    getInstructors(),
  ])

  if (!day) notFound()

  return <DayManifest day={day} instructors={instructors} />
}
