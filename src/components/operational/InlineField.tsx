'use client'

import { useState, useRef } from 'react'

// ─── Inline editable field ────────────────────────────────────────────────────

export function InlineField({
  value,
  placeholder,
  onSave,
  inputType = 'text',
  className = '',
}: {
  value: string
  placeholder: string
  onSave: (v: string) => void
  inputType?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(value)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    setEditing(false)
    if (draft.trim() !== value) onSave(draft.trim())
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={inputType}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        className={`bg-background border border-input rounded px-1 py-0 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 min-w-0 ${className}`}
        autoFocus
      />
    )
  }

  return (
    <span
      onClick={startEdit}
      className={`cursor-text hover:bg-secondary/60 rounded px-1 py-0.5 text-xs transition-colors ${
        value ? 'text-foreground' : 'text-muted-foreground/40'
      } ${className}`}
    >
      {value || placeholder}
    </span>
  )
}
