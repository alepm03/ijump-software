import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Milliseconds after which a lead with no staff contact counts as "cold" (48h). */
export const LEAD_AGING_THRESHOLD_MS = 48 * 60 * 60 * 1000

/**
 * CRM P0 — compact "time since last contact" label for the lead-aging queue:
 * "6h" under a day, "3d" from then on. Null (no contact recorded, e.g. rows
 * predating the last_contact_at backfill) reads as "?" — old enough to worry.
 */
export function formatAging(lastContactAt: string | null | undefined): string {
  if (!lastContactAt) return '?'
  const ms = Date.now() - new Date(lastContactAt).getTime()
  if (ms < 0) return '0h'
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** True if the lead's last contact is unknown or older than the 48h threshold. */
export function isLeadCold(lastContactAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastContactAt) return true
  return now - new Date(lastContactAt).getTime() > LEAD_AGING_THRESHOLD_MS
}
