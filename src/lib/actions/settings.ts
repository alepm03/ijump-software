'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

type DbClient = SupabaseClient<Database>

/**
 * Reads a boolean business_settings row.
 *
 * Missing row or read error → `fallback`. These flags gate behaviour that
 * must stay predictable when the settings table is unreachable, so every
 * caller states the safe value explicitly instead of assuming one here.
 */
async function readBooleanSetting(
  key: string,
  fallback: boolean,
  client?: DbClient
): Promise<boolean> {
  const supabase = client ?? (await createClient())
  const { data, error } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error) {
    console.error(`readBooleanSetting(${key}) failed`, error.message)
    return fallback
  }
  if (!data) return fallback
  return data.value.trim().toLowerCase() === 'true'
}

/**
 * Whether the bot may confirm a reservation itself (assigning a real seat) or
 * must leave it as a NEW lead for staff review in /reservas.
 *
 * Defaults to FALSE while the migration off the legacy booking channel is in
 * progress — see the 20260903000000 migration. Failing closed is the safe
 * direction: an unconfirmed lead is visible and one click from the manifest,
 * whereas an auto-confirmed one can silently double-book a flight the old
 * book already filled.
 */
export async function isBotAutoconfirmEnabled(client?: DbClient): Promise<boolean> {
  return readBooleanSetting('bot_autoconfirm_enabled', false, client)
}
