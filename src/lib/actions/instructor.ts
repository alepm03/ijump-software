'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Instructor } from '@/types/domain'

export async function getInstructors(): Promise<Instructor[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instructors')
    .select('*')
    .order('name')

  if (error) throw new Error(error.message)

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
  }))
}

export async function createInstructor(
  name: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('instructors').insert({ name })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function toggleInstructorActive(
  id: string
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data, error: fetchError } = await supabase
    .from('instructors')
    .select('active')
    .eq('id', id)
    .single()

  if (fetchError) return { error: fetchError.message }

  const { error } = await supabase
    .from('instructors')
    .update({ active: !data.active })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}
