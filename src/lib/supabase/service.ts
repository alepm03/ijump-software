import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Server-only: bypasses RLS. Never import in client components.
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
