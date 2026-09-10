import { getOperationalDay } from '@/lib/actions/operational-day'
import { getInstructors } from '@/lib/actions/instructor'
import { getPolicy } from '@/lib/actions/availability'
import { listProducts } from '@/lib/actions/finance'
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
  // products: the active catalog, needed by the manifest row to (a) tell an
  // OVERWEIGHT line apart from any other supplement and (b) power the
  // "+ Extra" on-site upsell picker.
  const [day, instructors, policy, products] = await Promise.all([
    getOperationalDay(date),
    getInstructors(true),
    getPolicy(),
    listProducts(),
  ])

  if (!day) return <EmptyDayState date={date} />

  return <DayManifest day={day} instructors={instructors} policy={policy} products={products} highlightId={highlight ?? null} />
}
