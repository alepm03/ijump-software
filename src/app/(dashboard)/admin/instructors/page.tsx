import { getInstructors } from '@/lib/actions/instructor'
import { InstructorsManager } from '@/components/operational/InstructorsManager'

export default async function InstructorsPage() {
  const instructors = await getInstructors()

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Instructores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestiona el equipo de instructores del centro.
          </p>
        </div>
        <InstructorsManager instructors={instructors} />
      </div>
    </div>
  )
}
