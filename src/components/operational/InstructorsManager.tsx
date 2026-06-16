'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createInstructor, toggleInstructorActive } from '@/lib/actions/instructor'
import { useRouter } from 'next/navigation'
import type { Instructor } from '@/types/domain'

interface Props {
  instructors: Instructor[]
}

export function InstructorsManager({ instructors }: Props) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const active = instructors.filter((i) => i.active)
  const inactive = instructors.filter((i) => !i.active)

  function openForm() {
    setAdding(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createInstructor(trimmed)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Instructor "${trimmed}" creado`)
        setName('')
        setAdding(false)
        router.refresh()
      }
    })
  }

  async function handleToggle(instructor: Instructor) {
    setToggling(instructor.id)
    const result = await toggleInstructorActive(instructor.id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(
        instructor.active
          ? `${instructor.name} desactivado`
          : `${instructor.name} activado`
      )
      router.refresh()
    }
    setToggling(null)
  }

  return (
    <div className="space-y-4">
      {/* Create form */}
      {adding ? (
        <form
          onSubmit={handleCreate}
          className="flex gap-2 p-4 rounded-xl border border-primary/30 bg-card"
        >
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del instructor"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setName('') }}
            className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <button
          onClick={openForm}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-secondary transition w-full"
        >
          <span className="text-lg leading-none">+</span>
          Añadir instructor
        </button>
      )}

      {/* Active instructors */}
      {active.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/50 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Activos · {active.length}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {active.map((instructor) => (
              <InstructorRow
                key={instructor.id}
                instructor={instructor}
                onToggle={handleToggle}
                loading={toggling === instructor.id}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Inactive instructors */}
      {inactive.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/50 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Inactivos · {inactive.length}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {inactive.map((instructor) => (
              <InstructorRow
                key={instructor.id}
                instructor={instructor}
                onToggle={handleToggle}
                loading={toggling === instructor.id}
              />
            ))}
          </ul>
        </div>
      )}

      {instructors.length === 0 && !adding && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No hay instructores. Añade el primero.
        </div>
      )}
    </div>
  )
}

function InstructorRow({
  instructor,
  onToggle,
  loading,
}: {
  instructor: Instructor
  onToggle: (i: Instructor) => void
  loading: boolean
}) {
  const initials = instructor.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-semibold text-primary">{initials}</span>
      </div>

      {/* Name */}
      <span className="flex-1 text-sm font-medium text-foreground">
        {instructor.name}
      </span>

      {/* Status badge */}
      <span
        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          instructor.active
            ? 'bg-green-50 text-green-700'
            : 'bg-secondary text-muted-foreground'
        }`}
      >
        {instructor.active ? 'Activo' : 'Inactivo'}
      </span>

      {/* Toggle button */}
      <button
        onClick={() => onToggle(instructor)}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition disabled:opacity-50"
      >
        {loading ? '...' : instructor.active ? 'Desactivar' : 'Activar'}
      </button>
    </li>
  )
}
