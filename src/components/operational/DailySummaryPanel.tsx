'use client'

// DailySummaryPanel — retained as a data-aggregation utility.
// The bottom bar render has been removed (v4 redesign); KPIs now live
// in the DayHeader KPI strip. This file is kept so the computeSummary
// import from lib/manifest-summary is the single source of truth.

export { computeManifestSummary } from '@/lib/manifest-summary'
export type { } from '@/lib/manifest-summary'
