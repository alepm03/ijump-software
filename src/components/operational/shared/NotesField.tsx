'use client'

import { useState } from 'react'

// ─── Notes textarea with save-on-blur ─────────────────────────────────────────

export interface NotesFieldProps {
  value: string
  onSave: (v: string) => void
}

export function NotesField({ value, onSave }: NotesFieldProps) {
  const [draft, setDraft] = useState(value)

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft) }}
      placeholder="Sin notas"
      rows={3}
      className="w-full text-sm bg-background border border-border rounded px-3 py-2 text-foreground outline-none resize-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors placeholder:text-muted-foreground/40"
    />
  )
}
