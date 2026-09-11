'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  FinancialSettings,
  DayExpense,
  ExpenseType,
  DayFinancials,
  MonthFinancialSummary,
  MonthFinancialsDetail,
  DayExpenseWithDate,
  InstructorPayout,
  PaymentMethod,
  // finance v2
  Product,
  ProductCategory,
  ParticipantItem,
  ExpenseCategory,
  ExpenseGroup,
  RateBasis,
  Expense,
  SaleChannel,
  ChannelKind,
  ProfitAndLoss,
  // KPI dashboard
  FinanceKpis,
  MixEntry,
  InstructorProductivity,
  PaymentStageBreakdown,
} from '@/types/domain'
import {
  buildPnl,
  type ParticipantPnlRow,
  type FlightPnlRow,
  type DayPnlRow,
} from '@/lib/finance/pnl-engine'
import {
  computeAutoItems,
  AR_BALANCE_EPSILON,
  type ProductLookup,
  type ChannelPriceLookup,
} from '@/lib/finance/itemization-engine'
import type {
  ChannelProductPrice,
  PackageType,
  ReservationSource,
  ArReceivableRow,
  ArSummary,
} from '@/types/domain'
import { RESERVATION_SOURCE_LABELS } from '@/types/domain'
import type { DbClient } from '@/lib/actions/availability'

// ─── Settings ───────────────────────────────────────────────

export async function getFinancialSettings(): Promise<FinancialSettings> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financial_settings')
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  return {
    id: data.id,
    fuelPricePerFlight: data.fuel_price_per_flight,
    hangarPricePerDay: data.hangar_price_per_day,
    packerFeePerJump: data.packer_fee_per_jump,
    updatedAt: data.updated_at,
  }
}

export async function updateFinancialSettings(params: {
  fuelPricePerFlight?: number
  hangarPricePerDay?: number
  packerFeePerJump?: number
}): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from('financial_settings')
    .select('id')
    .single()

  if (fetchError) return { error: fetchError.message }

  const { error } = await supabase
    .from('financial_settings')
    .update({
      ...(params.fuelPricePerFlight !== undefined && { fuel_price_per_flight: params.fuelPricePerFlight }),
      ...(params.hangarPricePerDay !== undefined && { hangar_price_per_day: params.hangarPricePerDay }),
      ...(params.packerFeePerJump !== undefined && { packer_fee_per_jump: params.packerFeePerJump }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

// ─── Day expenses ────────────────────────────────────────────

export async function upsertDayExpense(params: {
  id?: string
  operationalDayId: string
  type: ExpenseType
  description?: string | null
  amount: number
}): Promise<{ error?: string; expense?: DayExpense }> {
  const supabase = await createClient()

  if (params.id) {
    const { data, error } = await supabase
      .from('day_expenses')
      .update({
        type: params.type,
        description: params.description ?? null,
        amount: params.amount,
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return { error: error.message }
    revalidatePath('/', 'layout')
    return {
      expense: {
        id: data.id,
        operationalDayId: data.operational_day_id,
        type: data.type,
        description: data.description,
        amount: data.amount,
        createdAt: data.created_at,
      },
    }
  }

  const { data, error } = await supabase
    .from('day_expenses')
    .insert({
      operational_day_id: params.operationalDayId,
      type: params.type,
      description: params.description ?? null,
      amount: params.amount,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {
    expense: {
      id: data.id,
      operationalDayId: data.operational_day_id,
      type: data.type,
      description: data.description,
      amount: data.amount,
      createdAt: data.created_at,
    },
  }
}

export async function deleteDayExpense(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('day_expenses').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

// ─── Day financials ──────────────────────────────────────────

export async function getDayFinancials(date: string): Promise<DayFinancials | null> {
  const supabase = await createClient()

  const [dayResult, settingsResult] = await Promise.all([
    supabase
      .from('operational_days')
      .select(`
        id,
        flights (
          id,
          participants (
            id,
            assigned_instructor_id,
            operational_status,
            payments ( amount, method, stage ),
            instructor:instructors!participants_assigned_instructor_id_fkey (
              id, name, fee_per_jump
            )
          )
        )
      `)
      .eq('date', date)
      .single(),
    supabase.from('financial_settings').select('*').single(),
  ])

  if (dayResult.error) {
    if (dayResult.error.code === 'PGRST116') return null
    throw new Error(dayResult.error.message)
  }
  if (settingsResult.error) throw new Error(settingsResult.error.message)

  const day = dayResult.data
  const settings = settingsResult.data

  const { data: expenses, error: expensesError } = await supabase
    .from('day_expenses')
    .select('*')
    .eq('operational_day_id', day.id)

  if (expensesError) throw new Error(expensesError.message)

  const flights = day.flights ?? []
  const flightCount = flights.length
  const allParticipants = flights.flatMap((f) => f.participants ?? [])
  const completedParticipants = allParticipants.filter(
    (p) => p.operational_status !== 'CANCELLED' && p.operational_status !== 'NO_SHOW' && p.operational_status !== 'WEATHER_CANCELLED'
  )
  const jumpCount = completedParticipants.length

  // Revenue
  const allPayments = allParticipants.flatMap((p) => p.payments ?? [])
  const totalRevenue = allPayments.reduce((sum, pmt) => sum + pmt.amount, 0)

  const revenueByMethod = {} as Record<PaymentMethod, number>
  for (const pmt of allPayments) {
    const method = pmt.method as PaymentMethod
    revenueByMethod[method] = (revenueByMethod[method] ?? 0) + pmt.amount
  }

  // Fuel
  const fuelOverride = expenses?.find((e) => e.type === 'FUEL_OVERRIDE')
  const fuelCost = fuelOverride ? fuelOverride.amount : settings.fuel_price_per_flight * flightCount
  const fuelIsOverride = !!fuelOverride

  // Hangar
  const hangarOverride = expenses?.find((e) => e.type === 'HANGAR_OVERRIDE')
  const hangarCost = hangarOverride ? hangarOverride.amount : settings.hangar_price_per_day
  const hangarIsOverride = !!hangarOverride

  // Instructor payouts
  const instructorMap = new Map<string, InstructorPayout>()
  for (const p of completedParticipants) {
    if (!p.instructor || !p.assigned_instructor_id) continue
    const key = p.assigned_instructor_id
    if (!instructorMap.has(key)) {
      instructorMap.set(key, {
        instructorId: key,
        name: p.instructor.name,
        jumps: 0,
        feePerJump: p.instructor.fee_per_jump,
        total: 0,
      })
    }
    const entry = instructorMap.get(key)!
    entry.jumps += 1
    entry.total = entry.jumps * entry.feePerJump
  }
  const instructorPayouts = Array.from(instructorMap.values())
  const totalInstructorCost = instructorPayouts.reduce((sum, ip) => sum + ip.total, 0)

  // Packers
  const packerCost = settings.packer_fee_per_jump * jumpCount

  // Custom expenses
  const customExpenses: DayExpense[] = (expenses ?? [])
    .filter((e) => e.type === 'CUSTOM')
    .map((e) => ({
      id: e.id,
      operationalDayId: e.operational_day_id,
      type: e.type,
      description: e.description,
      amount: e.amount,
      createdAt: e.created_at,
    }))

  const totalCosts = fuelCost + hangarCost + totalInstructorCost + packerCost +
    customExpenses.reduce((sum, e) => sum + e.amount, 0)

  return {
    date,
    operationalDayId: day.id,
    totalRevenue,
    revenueByMethod,
    fuelCost,
    fuelIsOverride,
    fuelOverrideExpenseId: fuelOverride?.id ?? null,
    hangarCost,
    hangarIsOverride,
    hangarOverrideExpenseId: hangarOverride?.id ?? null,
    instructorPayouts,
    totalInstructorCost,
    packerCost,
    customExpenses,
    totalCosts,
    netProfit: totalRevenue - totalCosts,
  }
}

// ─── Month financials ────────────────────────────────────────

export async function getMonthFinancials(
  month: string // YYYY-MM
): Promise<MonthFinancialSummary[]> {
  const supabase = await createClient()

  const from = `${month}-01`
  const year = parseInt(month.split('-')[0])
  const monthNum = parseInt(month.split('-')[1])
  const lastDay = new Date(year, monthNum, 0).getDate()
  const to = `${month}-${String(lastDay).padStart(2, '0')}`

  const [daysResult, settingsResult] = await Promise.all([
    supabase
      .from('operational_days')
      .select(`
        id,
        date,
        flights (
          id,
          participants (
            id,
            assigned_instructor_id,
            operational_status,
            payments ( amount, method, stage ),
            instructor:instructors!participants_assigned_instructor_id_fkey (
              id, fee_per_jump
            )
          )
        )
      `)
      .gte('date', from)
      .lte('date', to)
      .order('date'),
    supabase.from('financial_settings').select('*').single(),
  ])

  if (daysResult.error) throw new Error(daysResult.error.message)
  if (settingsResult.error) throw new Error(settingsResult.error.message)

  if (!daysResult.data?.length) return []

  const dayIds = daysResult.data.map((d) => d.id)
  const { data: allExpenses, error: expensesError } = await supabase
    .from('day_expenses')
    .select('*')
    .in('operational_day_id', dayIds)

  if (expensesError) throw new Error(expensesError.message)

  const settings = settingsResult.data
  const expensesByDay = new Map<string, typeof allExpenses>()
  for (const e of allExpenses ?? []) {
    if (!expensesByDay.has(e.operational_day_id)) expensesByDay.set(e.operational_day_id, [])
    expensesByDay.get(e.operational_day_id)!.push(e)
  }

  return daysResult.data.map((d) => {
    const flights = d.flights ?? []
    const flightCount = flights.length
    const allParticipants = flights.flatMap((f) => f.participants ?? [])
    const completedParticipants = allParticipants.filter(
      (p) => p.operational_status !== 'CANCELLED' && p.operational_status !== 'NO_SHOW' && p.operational_status !== 'WEATHER_CANCELLED'
    )
    const jumpCount = completedParticipants.length
    const dayExpenses = expensesByDay.get(d.id) ?? []

    const totalRevenue = allParticipants
      .flatMap((p) => p.payments ?? [])
      .reduce((sum, pmt) => sum + pmt.amount, 0)

    const fuelOverride = dayExpenses.find((e) => e.type === 'FUEL_OVERRIDE')
    const fuelCost = fuelOverride ? fuelOverride.amount : settings.fuel_price_per_flight * flightCount

    const hangarOverride = dayExpenses.find((e) => e.type === 'HANGAR_OVERRIDE')
    const hangarCost = hangarOverride ? hangarOverride.amount : settings.hangar_price_per_day

    const packerCost = settings.packer_fee_per_jump * jumpCount

    const instructorCost = completedParticipants.reduce((sum, p) => {
      if (!p.instructor) return sum
      return sum + p.instructor.fee_per_jump
    }, 0)

    const customTotal = dayExpenses
      .filter((e) => e.type === 'CUSTOM')
      .reduce((sum, e) => sum + e.amount, 0)

    const totalCosts = fuelCost + hangarCost + packerCost + instructorCost + customTotal

    return {
      date: d.date,
      totalRevenue,
      totalCosts,
      netProfit: totalRevenue - totalCosts,
      jumpCount,
      flightCount,
    }
  })
}

// ─── Instructor payouts for a month ─────────────────────────

export async function getInstructorPayouts(
  month: string // YYYY-MM
): Promise<InstructorPayout[]> {
  const supabase = await createClient()

  const from = `${month}-01`
  const year = parseInt(month.split('-')[0])
  const monthNum = parseInt(month.split('-')[1])
  const lastDay = new Date(year, monthNum, 0).getDate()
  const to = `${month}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('operational_days')
    .select(`
      flights (
        participants (
          assigned_instructor_id,
          operational_status,
          instructor:instructors!participants_assigned_instructor_id_fkey (
            id, name, fee_per_jump
          )
        )
      )
    `)
    .gte('date', from)
    .lte('date', to)

  if (error) throw new Error(error.message)

  const instructorMap = new Map<string, InstructorPayout>()

  for (const day of data ?? []) {
    for (const flight of day.flights ?? []) {
      for (const p of flight.participants ?? []) {
        if (!p.instructor || !p.assigned_instructor_id) continue
        if (
          p.operational_status === 'CANCELLED' ||
          p.operational_status === 'NO_SHOW' ||
          p.operational_status === 'WEATHER_CANCELLED'
        ) continue

        const key = p.assigned_instructor_id
        if (!instructorMap.has(key)) {
          instructorMap.set(key, {
            instructorId: key,
            name: p.instructor.name,
            jumps: 0,
            feePerJump: p.instructor.fee_per_jump,
            total: 0,
          })
        }
        const entry = instructorMap.get(key)!
        entry.jumps += 1
        entry.total = entry.jumps * entry.feePerJump
      }
    }
  }

  return Array.from(instructorMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Month financials detail ─────────────────────────────────

function monthRange(month: string): { from: string; to: string } {
  const year = parseInt(month.split('-')[0])
  const monthNum = parseInt(month.split('-')[1])
  const lastDay = new Date(year, monthNum, 0).getDate()
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export async function getMonthFinancialsDetail(
  month: string // YYYY-MM
): Promise<MonthFinancialsDetail> {
  const supabase = await createClient()
  const { from, to } = monthRange(month)

  const [daysResult, settingsResult] = await Promise.all([
    supabase
      .from('operational_days')
      .select(`
        id,
        date,
        flights (
          id,
          participants (
            id,
            assigned_instructor_id,
            operational_status,
            payments ( amount, method ),
            instructor:instructors!participants_assigned_instructor_id_fkey (
              id, name, fee_per_jump
            )
          )
        )
      `)
      .gte('date', from)
      .lte('date', to)
      .order('date'),
    supabase.from('financial_settings').select('*').single(),
  ])

  if (daysResult.error) throw new Error(daysResult.error.message)
  if (settingsResult.error) throw new Error(settingsResult.error.message)

  const days = daysResult.data ?? []
  const settings = settingsResult.data

  // Fetch all expenses for the month in one query
  const dayIds = days.map((d) => d.id)
  type DayExpenseRow = { id: string; operational_day_id: string; type: 'FUEL_OVERRIDE' | 'HANGAR_OVERRIDE' | 'CUSTOM'; description: string | null; amount: number; created_at: string }
  let allExpenses: DayExpenseRow[] = []
  let expensesError: { message: string } | null = null

  if (dayIds.length) {
    const result = await supabase.from('day_expenses').select('*').in('operational_day_id', dayIds)
    if (result.error) expensesError = result.error
    else allExpenses = result.data ?? []
  }

  if (expensesError) throw new Error(expensesError.message)

  // Build a date lookup for expenses
  const dayDateById = new Map(days.map((d) => [d.id, d.date]))

  // Aggregate
  let totalRevenue = 0
  const revenueByMethod: Record<string, number> = {}
  let totalFuelCost = 0
  let totalHangarCost = 0
  let totalPackerCost = 0
  const instructorMap = new Map<string, InstructorPayout>()
  const customExpenses: DayExpenseWithDate[] = []
  let totalCustomCost = 0
  let flightCount = 0
  let jumpCount = 0

  // Group expenses by day
  const expensesByDay = new Map<string, DayExpenseRow[]>()
  for (const e of allExpenses) {
    if (!expensesByDay.has(e.operational_day_id)) expensesByDay.set(e.operational_day_id, [])
    expensesByDay.get(e.operational_day_id)!.push(e)
  }

  for (const day of days) {
    const dayFlights = day.flights ?? []
    const dayExpenses = expensesByDay.get(day.id) ?? []
    const allParticipants = dayFlights.flatMap((f) => f.participants ?? [])
    const completedP = allParticipants.filter(
      (p) =>
        p.operational_status !== 'CANCELLED' &&
        p.operational_status !== 'NO_SHOW' &&
        p.operational_status !== 'WEATHER_CANCELLED'
    )

    flightCount += dayFlights.length
    jumpCount += completedP.length

    // Revenue
    for (const p of allParticipants) {
      for (const pmt of p.payments ?? []) {
        totalRevenue += pmt.amount
        revenueByMethod[pmt.method] = (revenueByMethod[pmt.method] ?? 0) + pmt.amount
      }
    }

    // Fuel
    const fuelOverride = dayExpenses.find((e) => e.type === 'FUEL_OVERRIDE')
    totalFuelCost += fuelOverride
      ? fuelOverride.amount
      : settings.fuel_price_per_flight * dayFlights.length

    // Hangar
    const hangarOverride = dayExpenses.find((e) => e.type === 'HANGAR_OVERRIDE')
    totalHangarCost += hangarOverride ? hangarOverride.amount : settings.hangar_price_per_day

    // Packers
    totalPackerCost += settings.packer_fee_per_jump * completedP.length

    // Instructors
    for (const p of completedP) {
      if (!p.instructor || !p.assigned_instructor_id) continue
      const key = p.assigned_instructor_id
      if (!instructorMap.has(key)) {
        instructorMap.set(key, {
          instructorId: key,
          name: p.instructor.name,
          jumps: 0,
          feePerJump: p.instructor.fee_per_jump,
          total: 0,
        })
      }
      const entry = instructorMap.get(key)!
      entry.jumps += 1
      entry.total = entry.jumps * entry.feePerJump
    }

    // Custom expenses
    for (const e of dayExpenses.filter((e) => e.type === 'CUSTOM')) {
      totalCustomCost += e.amount
      customExpenses.push({
        id: e.id,
        operationalDayId: e.operational_day_id,
        type: e.type,
        description: e.description,
        amount: e.amount,
        createdAt: e.created_at,
        date: dayDateById.get(e.operational_day_id) ?? '',
      })
    }
  }

  const instructorPayouts = Array.from(instructorMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  const totalInstructorCost = instructorPayouts.reduce((s, ip) => s + ip.total, 0)
  const totalCosts = totalFuelCost + totalHangarCost + totalPackerCost + totalInstructorCost + totalCustomCost

  return {
    month,
    dayCount: days.length,
    flightCount,
    jumpCount,
    totalRevenue,
    revenueByMethod: revenueByMethod as Record<PaymentMethod, number>,
    totalFuelCost,
    totalHangarCost,
    totalPackerCost,
    instructorPayouts,
    totalInstructorCost,
    customExpenses,
    totalCustomCost,
    totalCosts,
    netProfit: totalRevenue - totalCosts,
  }
}

// ═══════════════════════════════════════════════════════════════
// FINANCE V2 — Products
// ═══════════════════════════════════════════════════════════════

function rowToProduct(row: {
  id: string
  code: string
  name: string
  category: string
  base_price: number
  vat_rate: number | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}): Product {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category as ProductCategory,
    basePrice: row.base_price,
    vatRate: row.vat_rate,
    active: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listProducts(includeInactive = false): Promise<Product[]> {
  const supabase = await createClient()
  let query = supabase.from('products').select('*').order('sort_order')
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToProduct)
}

export async function createProduct(params: {
  code: string
  name: string
  category: ProductCategory
  basePrice: number
  vatRate?: number | null
  sortOrder?: number
}): Promise<{ error?: string; product?: Product }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .insert({
      code: params.code,
      name: params.name,
      category: params.category,
      base_price: params.basePrice,
      vat_rate: params.vatRate ?? null,
      sort_order: params.sortOrder ?? 0,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { product: rowToProduct(data) }
}

export async function updateProduct(
  id: string,
  params: {
    code?: string
    name?: string
    category?: ProductCategory
    basePrice?: number
    vatRate?: number | null
    sortOrder?: number
  }
): Promise<{ error?: string; product?: Product }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .update({
      ...(params.code !== undefined && { code: params.code }),
      ...(params.name !== undefined && { name: params.name }),
      ...(params.category !== undefined && { category: params.category }),
      ...(params.basePrice !== undefined && { base_price: params.basePrice }),
      ...(params.vatRate !== undefined && { vat_rate: params.vatRate }),
      ...(params.sortOrder !== undefined && { sort_order: params.sortOrder }),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { product: rowToProduct(data) }
}

export async function setProductActive(
  id: string,
  active: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ active })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

// ═══════════════════════════════════════════════════════════════
// FINANCE V2 — Participant items
// ═══════════════════════════════════════════════════════════════

function rowToParticipantItem(row: {
  id: string
  participant_id: string
  product_id: string
  quantity: number
  unit_price: number
  vat_rate: number | null
  amount: number | null  // GENERATED ALWAYS AS — CLI types as nullable, always computed
  notes: string | null
  created_at: string
  auto_generated?: boolean
}): ParticipantItem {
  return {
    id: row.id,
    participantId: row.participant_id,
    productId: row.product_id,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    vatRate: row.vat_rate,
    amount: row.amount ?? row.quantity * row.unit_price,
    notes: row.notes,
    createdAt: row.created_at,
    autoGenerated: row.auto_generated ?? false,
  }
}

export async function listParticipantItems(
  participantId: string
): Promise<ParticipantItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('participant_items')
    .select('*')
    .eq('participant_id', participantId)
    .order('created_at')

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToParticipantItem)
}

export async function addParticipantItem(params: {
  participantId: string
  productId: string
  quantity?: number
  /** Defaults to product.base_price if omitted — pass explicitly to override */
  unitPrice: number
  vatRate?: number | null
  notes?: string | null
}): Promise<{ error?: string; item?: ParticipantItem }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('participant_items')
    .insert({
      participant_id: params.participantId,
      product_id: params.productId,
      quantity: params.quantity ?? 1,
      unit_price: params.unitPrice,
      vat_rate: params.vatRate ?? null,
      notes: params.notes ?? null,
      // amount is GENERATED — never included in Insert
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { item: rowToParticipantItem(data) }
}

export async function updateParticipantItem(
  id: string,
  params: {
    quantity?: number
    unitPrice?: number
    vatRate?: number | null
    notes?: string | null
  }
): Promise<{ error?: string; item?: ParticipantItem }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('participant_items')
    .update({
      // amount is GENERATED — never included in Update
      ...(params.quantity !== undefined && { quantity: params.quantity }),
      ...(params.unitPrice !== undefined && { unit_price: params.unitPrice }),
      ...(params.vatRate !== undefined && { vat_rate: params.vatRate }),
      ...(params.notes !== undefined && { notes: params.notes }),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { item: rowToParticipantItem(data) }
}

export async function deleteParticipantItem(
  id: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('participant_items')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

/**
 * One-click OVERWEIGHT supplement add from the manifest row (ParticipantRow
 * PaymentCell area) — Sprint 1 UI entregable. Resolves the OW product by
 * its catalog code server-side so the client never needs the product
 * catalog just to add this one supplement. Always auto_generated = false
 * (a manual, on-site addition), so it survives packageType re-syncs and
 * cancellation clears untouched — see syncAutoParticipantItems /
 * clearAutoParticipantItems.
 */
export async function addOverweightSupplement(
  participantId: string,
  unitPrice?: number
): Promise<{ error?: string; item?: ParticipantItem }> {
  const supabase = await createClient()

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, base_price')
    .eq('code', 'OW')
    .eq('active', true)
    .single()
  if (productError) return { error: 'El producto de sobrepeso (OW) no está activo en el catálogo' }

  // Idempotent: one OW supplement per person, ever. A double tap on the
  // manifest button must not double the recognized revenue.
  const { count: existing, error: existingError } = await supabase
    .from('participant_items')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', participantId)
    .eq('product_id', product.id)
  if (existingError) return { error: existingError.message }
  if ((existing ?? 0) > 0) {
    return { error: 'Este participante ya tiene el suplemento OW registrado' }
  }

  const { data, error } = await supabase
    .from('participant_items')
    .insert({
      participant_id: participantId,
      product_id: product.id,
      quantity: 1,
      unit_price: unitPrice ?? product.base_price,
      auto_generated: false,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { item: rowToParticipantItem(data) }
}

// ═══════════════════════════════════════════════════════════════
// TREASURY SPRINT 1 — channel_product_prices (net price per channel×product)
// ═══════════════════════════════════════════════════════════════

function rowToChannelProductPrice(row: {
  id: string
  channel: string
  product_id: string
  unit_price: number
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}): ChannelProductPrice {
  return {
    id: row.id,
    channel: row.channel as ReservationSource,
    productId: row.product_id,
    unitPrice: row.unit_price,
    active: row.active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listChannelProductPrices(
  client?: DbClient
): Promise<ChannelProductPrice[]> {
  const supabase = client ?? (await createClient())
  const { data, error } = await supabase
    .from('channel_product_prices')
    .select('*')
    .order('channel')

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToChannelProductPrice)
}

/** Upserts the net price for a (channel, product) pair — used by the admin pricing UI. */
export async function upsertChannelProductPrice(params: {
  channel: ReservationSource
  productId: string
  unitPrice: number
  active?: boolean
  notes?: string | null
}): Promise<{ error?: string; price?: ChannelProductPrice }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('channel_product_prices')
    .upsert(
      {
        channel: params.channel,
        product_id: params.productId,
        unit_price: params.unitPrice,
        active: params.active ?? true,
        notes: params.notes ?? null,
      },
      { onConflict: 'channel,product_id' }
    )
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { price: rowToChannelProductPrice(data) }
}

// ═══════════════════════════════════════════════════════════════
// TREASURY SPRINT 1 — Auto-itemization (packageType -> participant_items)
// ═══════════════════════════════════════════════════════════════
//
// "One data entry" principle: packageType is already captured at intake
// (createParticipant / createLead). This engine derives the base sale line
// items from it so nobody re-types the sale. Call sites (see participant.ts
// and leads.ts):
//   - createParticipant, when flightId is not null (a participant that is
//     immediately on a flight — walk-in or manifest add).
//   - confirmLead, right after reservations_assign_seat succeeds (the lead
//     now has a real flight_id).
//   - updateParticipant, when packageType changes on an existing participant
//     (re-sync: replace auto_generated rows, leave manual rows like OW).
//
// Idempotency: syncAutoParticipantItems always deletes existing
// auto_generated=true rows for the participant and re-inserts the current
// set. Calling it twice with the same packageType+channel is a no-op in
// effect (same rows come back). This is simpler and safer than diffing,
// and item rows are re-created (new ids) rather than mutated in place —
// acceptable because they are managed exclusively by this function and
// never referenced by id elsewhere.

/**
 * Resolves the ReservationSource for a participant via its reservation_group,
 * defaulting to DIRECT when the participant has no group (a real, expected
 * case — e.g. a walk-in added without picking a source). A genuine query
 * failure (network/RLS/etc.) is NOT treated the same as "no group": it
 * throws, so the caller reports a real error instead of silently pricing at
 * DIRECT rates for what might actually be a GROUPON/SMARTBOX participant.
 */
async function resolveParticipantChannel(
  supabase: DbClient,
  participantId: string
): Promise<ReservationSource> {
  const { data, error } = await supabase
    .from('participants')
    .select('reservation_group:reservation_groups!participants_reservation_group_id_fkey ( source )')
    .eq('id', participantId)
    .single()

  if (error) throw new Error(`resolveParticipantChannel: ${error.message}`)
  if (!data?.reservation_group) return 'DIRECT'
  return (data.reservation_group as unknown as { source: ReservationSource }).source
}

/**
 * Generates/re-syncs the auto_generated participant_items for one
 * participant from its current packageType, resolving unit prices through
 * channel_product_prices (falling back to products.base_price when no
 * active channel price row exists — see itemization-engine.ts).
 *
 * Safe to call multiple times (idempotent — see module header).
 * `client` lets callers already inside a Server Action (createParticipant,
 * confirmLead, updateParticipant) reuse their own Supabase client instead
 * of opening a new one.
 */
export async function syncAutoParticipantItems(
  participantId: string,
  packageType: PackageType,
  client?: DbClient
): Promise<{ error?: string }> {
  const supabase = client ?? (await createClient())

  let channel: ReservationSource
  try {
    channel = await resolveParticipantChannel(supabase, participantId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }

  const [{ data: productRows, error: productsError }, { data: priceRows, error: pricesError }] =
    await Promise.all([
      supabase.from('products').select('id, code, base_price').eq('active', true),
      supabase.from('channel_product_prices').select('channel, product_id, unit_price, active'),
    ])

  if (productsError) return { error: productsError.message }
  if (pricesError) return { error: pricesError.message }

  const products: ProductLookup[] = (productRows ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    basePrice: p.base_price,
  }))
  const channelPrices: ChannelPriceLookup[] = (priceRows ?? []).map((cp) => ({
    channel: cp.channel as ReservationSource,
    productId: cp.product_id,
    unitPrice: cp.unit_price,
    active: cp.active,
  }))

  let lines
  try {
    lines = computeAutoItems({ packageType, channel, products, channelPrices })
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }

  // Idempotent re-sync: drop the previous automatic lines, insert the
  // current set. Manual lines (auto_generated = false, e.g. OW) untouched.
  // NOTE: delete + insert are two separate calls, not one DB transaction —
  // a failure between them (rare: network blip, concurrent product delete)
  // leaves zero auto items until the next sync. Every call site treats this
  // as best-effort and logs rather than blocking the user-facing action, so
  // a failure here surfaces as an understated AR balance rather than a
  // crash. Acceptable for Sprint 1 (single-admin MVP, low write volume);
  // revisit with a Postgres function if it proves to matter in practice.
  const { error: deleteError } = await supabase
    .from('participant_items')
    .delete()
    .eq('participant_id', participantId)
    .eq('auto_generated', true)
  if (deleteError) return { error: deleteError.message }

  if (lines.length > 0) {
    const { error: insertError } = await supabase.from('participant_items').insert(
      lines.map((line) => ({
        participant_id: participantId,
        product_id: line.productId,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        auto_generated: true,
      }))
    )
    if (insertError) return { error: insertError.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

/**
 * Removes only the auto-generated participant_items for a participant,
 * leaving manual lines (e.g. OW) intact. Used when a participant stops
 * flying that day (weather cancellation, lead cancellation, NO_SHOW/
 * CANCELLED status) so their itemized revenue doesn't linger in the P&L —
 * see pnl-engine.ts: participantRevenue/accumulateRevenue sum ALL
 * participants regardless of operational_status (only completedJumpCount
 * filters by status), so a stale auto item would inflate revenueTotal for
 * someone who never flew. Deleting at the point of cancellation is the
 * simplest correct fix and requires no pnl-engine change.
 *
 * Interaction with `payments` (intentional, not a gap): if the participant
 * already has a deposit payment row, clearing their items does NOT erase
 * that revenue — pnl-engine's participantRevenue() falls back to summing
 * payments whenever participant_items is empty, so the deposit still counts
 * (now under SIN_DESGLOSE instead of its product category). This is
 * correct: per the waiver terms (src/lib/waiver-templates/waiver.ts —
 * "Los depósitos no son reembolsables... no será motivo en ningún caso de
 * devolución de la cantidad previamente abonada"), a weather/no-show
 * cancellation reschedules the jump but never refunds money already
 * collected, so that money must keep counting as revenue. Only the
 * itemized full-sale amount (never actually earned, since the jump never
 * happened) is removed.
 */
export async function clearAutoParticipantItems(
  participantId: string,
  client?: DbClient
): Promise<{ error?: string }> {
  const supabase = client ?? (await createClient())
  const { error } = await supabase
    .from('participant_items')
    .delete()
    .eq('participant_id', participantId)
    .eq('auto_generated', true)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

// ═══════════════════════════════════════════════════════════════
// TREASURY SPRINT 1 — Accounts Receivable (AR / "Cobros")
// ═══════════════════════════════════════════════════════════════
//
// balance = Σ(participant_items.amount) − Σ(payments.amount), derived, no
// new table. owedBy classifies who the balance is actually pending from:
// DIRECT/BONO/PROMO -> the client themselves; GROUPON/SMARTBOX (platform
// channels) -> the platform, since the itemized base sale is billed to the
// platform and the client only pays on-site supplements (2026-07-01 pricing
// decision). Only participants who are actually flying are considered
// (flight_id present) — leads never had a flight so never owe anything yet,
// and cancelled/no-show participants have their auto items cleared (see
// clearAutoParticipantItems) so their balance naturally goes to 0 rather
// than needing a status filter here.
//
// KNOWN LIMITATION (acceptable for Sprint 1, revisit if it becomes slow):
// this query is not date-bounded — it scans every participant with a
// flight_id ever assigned, not just recent/open operational days. Two
// things keep this cheap today: (a) real data volume is small (weekend-only
// operation), and (b) the pre-Sprint-1 historical backlog (Oct 2025) is
// forward-only and has no participant_items, so those rows have balance =
// 0 − payments ≤ 0 and are filtered out below without ever appearing in the
// result. If this later becomes a real cost as data accumulates, scope it
// to a rolling window (e.g. join operational_days and filter by date) the
// same way getDayPnl/getMonthPnl already do.

// Mirrors sale_channels.channel_kind = 'PLATFORM': the pending balance for
// these sources is owed by the platform (client already paid them), never by
// the client at the dropzone.
const PLATFORM_SOURCES: ReadonlySet<ReservationSource> = new Set([
  'GROUPON',
  'SMARTBOX',
  'WONDERBOX',
  'JUMPING',
  'FREEDOM',
])

export async function getArSummary(): Promise<ArSummary> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('participants')
    .select(
      `
      id,
      full_name,
      flight_id,
      operational_status,
      flight:flights ( id, operational_day:operational_days ( date ) ),
      reservation_group:reservation_groups!participants_reservation_group_id_fkey ( source ),
      payments ( amount ),
      participant_items ( amount )
    `
    )
    .not('flight_id', 'is', null)

  if (error) throw new Error(error.message)

  const rows: ArReceivableRow[] = []
  for (const p of data ?? []) {
    const itemsTotal = (p.participant_items ?? []).reduce((s, i) => s + (i.amount ?? 0), 0)
    const paymentsTotal = (p.payments ?? []).reduce((s, pay) => s + pay.amount, 0)
    const balance = itemsTotal - paymentsTotal
    if (balance <= AR_BALANCE_EPSILON) continue

    const source = ((p.reservation_group as { source?: string } | null)?.source ??
      'DIRECT') as ReservationSource
    const flight = p.flight as { operational_day?: { date?: string } | null } | null

    rows.push({
      participantId: p.id,
      fullName: p.full_name,
      operationalDayDate: flight?.operational_day?.date ?? null,
      flightId: p.flight_id,
      source,
      owedBy: PLATFORM_SOURCES.has(source) ? 'PLATFORM' : 'CLIENT',
      itemsTotal,
      paymentsTotal,
      balance,
    })
  }

  rows.sort((a, b) => (b.operationalDayDate ?? '').localeCompare(a.operationalDayDate ?? ''))

  const totalPendingClient = rows
    .filter((r) => r.owedBy === 'CLIENT')
    .reduce((s, r) => s + r.balance, 0)
  const totalPendingPlatform = rows
    .filter((r) => r.owedBy === 'PLATFORM')
    .reduce((s, r) => s + r.balance, 0)

  const byPlatform: Record<string, number> = {}
  for (const r of rows) {
    if (r.owedBy !== 'PLATFORM') continue
    byPlatform[r.source] = (byPlatform[r.source] ?? 0) + r.balance
  }

  return { rows, totalPendingClient, totalPendingPlatform, byPlatform }
}

// ═══════════════════════════════════════════════════════════════
// FINANCE V2 — Expense categories
// ═══════════════════════════════════════════════════════════════

function rowToExpenseCategory(row: {
  id: string
  code: string
  name: string
  group_type: string
  subgroup: string | null
  default_rate: number | null
  rate_basis: string | null
  sort_order: number
  active: boolean
}): ExpenseCategory {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    groupType: row.group_type as ExpenseGroup,
    subgroup: row.subgroup ?? null,
    defaultRate: row.default_rate,
    rateBasis: row.rate_basis as RateBasis | null,
    sortOrder: row.sort_order,
    active: row.active,
  }
}

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .order('sort_order')

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToExpenseCategory)
}

export async function updateExpenseCategoryRate(
  id: string,
  defaultRate: number | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('expense_categories')
    .update({ default_rate: defaultRate })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

// ═══════════════════════════════════════════════════════════════
// FINANCE V2 — Sale channels (per-channel commission)
// ═══════════════════════════════════════════════════════════════

function rowToSaleChannel(row: {
  id: string
  code: string
  name: string
  channel_kind: string
  commission_pct: number | null
  active: boolean
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}): SaleChannel {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    channelKind: row.channel_kind as ChannelKind,
    commissionPct: row.commission_pct,
    active: row.active,
    notes: row.notes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listSaleChannels(): Promise<SaleChannel[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sale_channels')
    .select('*')
    .order('sort_order')

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToSaleChannel)
}

export async function updateSaleChannelCommission(
  id: string,
  commissionPct: number | null
): Promise<{ error?: string }> {
  // Defense in depth: the UI validates, the column has a CHECK, but a non-UI
  // caller could still pass an out-of-range value — reject it here too.
  if (commissionPct !== null && (Number.isNaN(commissionPct) || commissionPct < 0 || commissionPct > 100)) {
    return { error: 'La comisión debe estar entre 0 y 100' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('sale_channels')
    .update({ commission_pct: commissionPct })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

// ═══════════════════════════════════════════════════════════════
// FINANCE V2 — Expenses
// ═══════════════════════════════════════════════════════════════

function rowToExpense(row: {
  id: string
  expense_category_id: string
  operational_day_id: string | null
  incurred_on: string
  description: string | null
  supplier: string | null
  sociedad: string | null
  amount: number
  vat_rate: number | null
  created_at: string
  updated_at: string
}): Expense {
  return {
    id: row.id,
    expenseCategoryId: row.expense_category_id,
    operationalDayId: row.operational_day_id,
    incurredOn: row.incurred_on,
    description: row.description,
    supplier: row.supplier,
    sociedad: row.sociedad,
    amount: row.amount,
    vatRate: row.vat_rate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listExpenses(filter: {
  month?: string       // 'YYYY-MM' — filters by incurred_on
  operationalDayId?: string
} = {}): Promise<Expense[]> {
  const supabase = await createClient()
  let query = supabase.from('expenses').select('*').order('incurred_on')

  if (filter.operationalDayId !== undefined) {
    query = query.eq('operational_day_id', filter.operationalDayId)
  }

  if (filter.month !== undefined) {
    const year = parseInt(filter.month.split('-')[0], 10)
    const monthNum = parseInt(filter.month.split('-')[1], 10)
    const lastDay = new Date(year, monthNum, 0).getDate()
    query = query
      .gte('incurred_on', `${filter.month}-01`)
      .lte('incurred_on', `${filter.month}-${String(lastDay).padStart(2, '0')}`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToExpense)
}

export async function createExpense(params: {
  expenseCategoryId: string
  operationalDayId?: string | null
  incurredOn: string
  description?: string | null
  supplier?: string | null
  sociedad?: string | null
  amount: number
  vatRate?: number | null
}): Promise<{ error?: string; expense?: Expense }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      expense_category_id: params.expenseCategoryId,
      operational_day_id: params.operationalDayId ?? null,
      incurred_on: params.incurredOn,
      description: params.description ?? null,
      supplier: params.supplier ?? null,
      sociedad: params.sociedad ?? null,
      amount: params.amount,
      vat_rate: params.vatRate ?? null,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { expense: rowToExpense(data) }
}

export async function updateExpense(
  id: string,
  params: {
    expenseCategoryId?: string
    operationalDayId?: string | null
    incurredOn?: string
    description?: string | null
    supplier?: string | null
    sociedad?: string | null
    amount?: number
    vatRate?: number | null
  }
): Promise<{ error?: string; expense?: Expense }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expenses')
    .update({
      ...(params.expenseCategoryId !== undefined && { expense_category_id: params.expenseCategoryId }),
      ...(params.operationalDayId !== undefined && { operational_day_id: params.operationalDayId }),
      ...(params.incurredOn !== undefined && { incurred_on: params.incurredOn }),
      ...(params.description !== undefined && { description: params.description }),
      ...(params.supplier !== undefined && { supplier: params.supplier }),
      ...(params.sociedad !== undefined && { sociedad: params.sociedad }),
      ...(params.amount !== undefined && { amount: params.amount }),
      ...(params.vatRate !== undefined && { vat_rate: params.vatRate }),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { expense: rowToExpense(data) }
}

export async function deleteExpense(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

// ─── Shared data-fetching helpers ───────────────────────────

/** Supabase select string reused by all P&L functions */
const PNL_DAY_SELECT = `
  id,
  date,
  flights (
    id,
    status,
    is_back_to_back,
    participants (
      id,
      operational_status,
      assigned_instructor_id,
      reservation_group:reservation_groups ( source ),
      payments ( amount ),
      participant_items ( amount, product_id, products ( category ) ),
      instructor:instructors!participants_assigned_instructor_id_fkey (
        id, name, fee_per_jump
      )
    )
  )
` as const

async function fetchPnlDays(
  supabase: Awaited<ReturnType<typeof createClient>>,
  from: string,
  to: string
): Promise<DayPnlRow[]> {
  const { data, error } = await supabase
    .from('operational_days')
    .select(PNL_DAY_SELECT)
    .gte('date', from)
    .lte('date', to)
    .order('date')

  if (error) throw new Error(error.message)
  // Cast: the nested join shape matches DayPnlRow
  return (data ?? []) as unknown as DayPnlRow[]
}

async function fetchPnlExpenses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  from: string,
  to: string
): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .gte('incurred_on', from)
    .lte('incurred_on', to)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToExpense)
}

/**
 * Retained deposits — money collected from leads that ended DEFINITIVELY
 * cancelled without holding a seat (lead_status CANCELLED, flight_id NULL):
 * their payments belong to no operational day, so the day-based P&L fetch
 * cannot see them and the money would silently vanish from revenue.
 * Attributed to the date the money came in (payments.created_at) — decision
 * jul-2026: matches the cash view. Leads cancelled while still attached to
 * a flight are already counted by the day P&L (payments-only rule for
 * non-flying participants); the flight_id IS NULL filter is what prevents
 * double counting. Boundary times compare in UTC (±2h vs Europe/Madrid at
 * period edges — accepted imprecision, same trade-off as cash close).
 */
async function fetchRetainedDeposits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  from: string,
  to: string
): Promise<number> {
  const toExclusive = new Date(`${to}T00:00:00Z`)
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)

  const { data, error } = await supabase
    .from('payments')
    .select('amount, created_at, participant:participants!inner(lead_status, flight_id)')
    .eq('participant.lead_status', 'CANCELLED')
    .is('participant.flight_id', null)
    .gte('created_at', `${from}T00:00:00Z`)
    .lt('created_at', toExclusive.toISOString())

  if (error) throw new Error(error.message)
  return (data ?? []).reduce((s, r) => s + r.amount, 0)
}

async function fetchCategories(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('active', true)
    .order('sort_order')

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToExpenseCategory)
}

async function fetchSaleChannels(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<SaleChannel[]> {
  const { data, error } = await supabase
    .from('sale_channels')
    .select('*')
    .eq('active', true)
    .order('sort_order')

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToSaleChannel)
}

// ═══════════════════════════════════════════════════════════════
// FINANCE V2 — Day operational day id lookup
// ═══════════════════════════════════════════════════════════════

/**
 * Returns the UUID of the operational_days row for a given date, or null if
 * no operational day exists for that date.  Used by day-scoped expense CRUD
 * so callers need not fetch the full v1 DayFinancials shape.
 */
export async function getOperationalDayId(date: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('operational_days')
    .select('id')
    .eq('date', date)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // no row
    throw new Error(error.message)
  }
  return data.id
}

// ═══════════════════════════════════════════════════════════════
// FINANCE V2 — P&L public server actions
// ═══════════════════════════════════════════════════════════════

/**
 * Number of distinct calendar months spanned by an inclusive [from, to] range.
 * Both args are 'YYYY-MM-DD'. Used to scale FIXED_PER_MONTH auto-rates.
 */
function countCalendarMonths(from: string, to: string): number {
  const [fy, fm] = from.split('-').map((n) => parseInt(n, 10))
  const [ty, tm] = to.split('-').map((n) => parseInt(n, 10))
  return (ty * 12 + tm) - (fy * 12 + fm) + 1
}

/** Day P&L for a single operational day (Europe/Madrid, ISO 8601) */
export async function getDayPnl(date: string): Promise<ProfitAndLoss> {
  const supabase = await createClient()
  const [days, expenses, categories, retainedDeposits] = await Promise.all([
    fetchPnlDays(supabase, date, date),
    fetchPnlExpenses(supabase, date, date),
    fetchCategories(supabase),
    fetchRetainedDeposits(supabase, date, date),
  ])

  // Day view: monthly fixed overhead is not attributed to a single day.
  return buildPnl({ periodLabel: date, days, expenses, categories, monthsInPeriod: 0, retainedDeposits })
}

/** ISO week P&L (Monday–Sunday). isoWeek is 1-based (1–53). */
export async function getWeekPnl(
  year: number,
  isoWeek: number
): Promise<ProfitAndLoss> {
  // ISO 8601 week: week 1 = the week containing the first Thursday of the year.
  // Monday of week W:
  //   jan4 is always in week 1. jan4.dayOfWeek (1=Mon..7=Sun ISO).
  //   dayOffset = isoWeek - 1
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = ((jan4.getUTCDay() + 6) % 7) // 0=Mon…6=Sun
  const monday = new Date(Date.UTC(year, 0, 4 - dayOfWeek + (isoWeek - 1) * 7))
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  const fmt = (d: Date): string => d.toISOString().slice(0, 10)
  const from = fmt(monday)
  const to = fmt(sunday)
  const periodLabel = `${year}-W${String(isoWeek).padStart(2, '0')}`

  const supabase = await createClient()
  const [days, expenses, categories, retainedDeposits] = await Promise.all([
    fetchPnlDays(supabase, from, to),
    fetchPnlExpenses(supabase, from, to),
    fetchCategories(supabase),
    fetchRetainedDeposits(supabase, from, to),
  ])

  // Week view: monthly fixed overhead is not attributed to a sub-monthly slice.
  return buildPnl({ periodLabel, days, expenses, categories, monthsInPeriod: 0, retainedDeposits })
}

/** Month P&L. month is 'YYYY-MM'. */
export async function getMonthPnl(month: string): Promise<ProfitAndLoss> {
  const year = parseInt(month.split('-')[0], 10)
  const monthNum = parseInt(month.split('-')[1], 10)
  const lastDay = new Date(year, monthNum, 0).getDate()
  const from = `${month}-01`
  const to = `${month}-${String(lastDay).padStart(2, '0')}`

  const supabase = await createClient()
  const [days, expenses, categories, retainedDeposits] = await Promise.all([
    fetchPnlDays(supabase, from, to),
    fetchPnlExpenses(supabase, from, to),
    fetchCategories(supabase),
    fetchRetainedDeposits(supabase, from, to),
  ])

  // Month view: monthly fixed costs charged once.
  return buildPnl({ periodLabel: month, days, expenses, categories, monthsInPeriod: 1, retainedDeposits })
}

/**
 * Year P&L (full year or YTD when opts.ytdThrough is provided).
 * ytdThrough must be 'YYYY-MM-DD'; defaults to last day of year.
 */
export async function getYearPnl(
  year: number,
  opts: { ytdThrough?: string } = {}
): Promise<ProfitAndLoss> {
  const from = `${year}-01-01`
  const to = opts.ytdThrough ?? `${year}-12-31`
  const isYtd = !!opts.ytdThrough
  const periodLabel = isYtd ? `${year} YTD (through ${to})` : String(year)

  const supabase = await createClient()
  const [days, expenses, categories, retainedDeposits] = await Promise.all([
    fetchPnlDays(supabase, from, to),
    fetchPnlExpenses(supabase, from, to),
    fetchCategories(supabase),
    fetchRetainedDeposits(supabase, from, to),
  ])

  // Year/YTD view: monthly fixed costs charged once per calendar month in range.
  // NOTE: this assumes a FIXED_PER_MONTH cost was active every month in the
  // range. For costs that start/stop mid-period (e.g. the plane loan from
  // Jun 2026), record actual monthly expense rows — they override the auto-rate.
  return buildPnl({
    periodLabel,
    days,
    expenses,
    categories,
    monthsInPeriod: countCalendarMonths(from, to),
    retainedDeposits,
  })
}

// ═══════════════════════════════════════════════════════════════
// FINANCE KPI DASHBOARD — getMonthKpis / getYearKpis
// ═══════════════════════════════════════════════════════════════

/** Select string for KPI queries — extends PNL_DAY_SELECT with reservation source + payment stage */
const KPI_DAY_SELECT = `
  id,
  date,
  flights (
    id,
    status,
    participants (
      id,
      operational_status,
      assigned_instructor_id,
      reservation_group_id,
      payments ( amount, stage ),
      participant_items ( amount, product_id, products ( category ) ),
      instructor:instructors!participants_assigned_instructor_id_fkey (
        id, name, fee_per_jump
      ),
      reservation_group:reservation_groups!participants_reservation_group_id_fkey (
        id, source
      )
    )
  )
` as const

interface KpiParticipantRow {
  id: string
  operational_status: string
  assigned_instructor_id: string | null
  reservation_group_id: string | null
  payments: { amount: number; stage: string }[]
  participant_items: { amount: number; product_id: string; products: { category: string } | null }[]
  instructor: { id: string; name: string; fee_per_jump: number } | null
  reservation_group: { id: string; source: string } | null
}

interface KpiFlightRow {
  id: string
  status: string
  participants: KpiParticipantRow[]
}

interface KpiDayRow {
  id: string
  date: string
  flights: KpiFlightRow[]
}

const CATEGORY_KPI_LABELS: Record<string, string> = {
  TANDEM_BASE:     'Tándem base',
  CAMERA_HANDYCAM: 'Handycam',
  CAMERA_EXTERNAL: 'Cámara externa',
  PHOTOS:          'Fotos',
  OVERWEIGHT:      'Sobrepeso (OW)',
  GROUND_REPORT:   'Reportaje en tierra',
  OTHER:           'Otros',
  SIN_DESGLOSE:    'Sin desglosar',
  DEPOSITO_RETENIDO: 'Depósitos retenidos',
}

const KPI_NON_COMPLETED = new Set(['CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED'])

function computeKpis(
  periodLabel: string,
  days: KpiDayRow[],
  pnlRevenueTotal: number,
  pnlRevenueByCategory: Partial<Record<string, number>>
): FinanceKpis {
  let totalFlights = 0
  let totalCompletedJumps = 0
  let totalParticipants = 0
  let weatherCancelledCount = 0

  const sourceCount = new Map<string, number>()
  const instructorJumps = new Map<string, number>()
  const instructorNames = new Map<string, string>()
  let reserva = 0
  let liquidacion = 0
  let suplemento = 0

  for (const day of days) {
    for (const flight of day.flights) {
      // Cancelled flights never flew — they stay out of the flight count
      // (same rule as buildPnl's PER_FLIGHT costs). Their participants are
      // still iterated: zero-orphans normally leaves them empty, but if any
      // remain their payments/status must keep counting.
      if (flight.status !== 'CANCELLED') totalFlights++
      for (const p of flight.participants) {
        totalParticipants++

        for (const pay of p.payments) {
          if (pay.stage === 'RESERVA') reserva += pay.amount
          else if (pay.stage === 'LIQUIDACION') liquidacion += pay.amount
          else if (pay.stage === 'SUPLEMENTO') suplemento += pay.amount
        }

        if (p.operational_status === 'WEATHER_CANCELLED') {
          weatherCancelledCount++
        }

        if (KPI_NON_COMPLETED.has(p.operational_status)) continue

        totalCompletedJumps++

        const source = p.reservation_group?.source ?? 'DIRECT'
        sourceCount.set(source, (sourceCount.get(source) ?? 0) + 1)

        if (p.assigned_instructor_id && p.instructor) {
          const key = p.assigned_instructor_id
          instructorJumps.set(key, (instructorJumps.get(key) ?? 0) + 1)
          if (!instructorNames.has(key)) instructorNames.set(key, p.instructor.name)
        }
      }
    }
  }

  const avgClientsPerFlight = totalFlights > 0 ? totalCompletedJumps / totalFlights : 0
  const occupancyPct = (avgClientsPerFlight / 2) * 100
  const revenuePerJump = totalCompletedJumps > 0 ? pnlRevenueTotal / totalCompletedJumps : 0
  const weatherCancellationPct =
    totalParticipants > 0 ? (weatherCancelledCount / totalParticipants) * 100 : 0

  const mixBySource: MixEntry[] = Array.from(sourceCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({
      label: RESERVATION_SOURCE_LABELS[source as ReservationSource] ?? source,
      count,
      share: totalCompletedJumps > 0 ? (count / totalCompletedJumps) * 100 : 0,
    }))

  const productTotal: number = Object.values(pnlRevenueByCategory).reduce<number>(
    (s, v) => s + (v ?? 0),
    0
  )
  const mixByProduct: MixEntry[] = Object.entries(pnlRevenueByCategory)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([key, amount]) => ({
      label: CATEGORY_KPI_LABELS[key] ?? key,
      count: 0,
      share: productTotal > 0 ? ((amount ?? 0) / productTotal) * 100 : 0,
    }))

  const instructorProductivity: InstructorProductivity[] = Array.from(instructorJumps.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, jumps]) => ({
      instructorId: id,
      name: instructorNames.get(id) ?? 'Desconocido',
      jumps,
      shareOfTotal: totalCompletedJumps > 0 ? (jumps / totalCompletedJumps) * 100 : 0,
    }))

  const paymentStages: PaymentStageBreakdown = {
    reserva,
    liquidacion,
    suplemento,
    total: reserva + liquidacion + suplemento,
  }

  return {
    periodLabel,
    avgClientsPerFlight,
    occupancyPct,
    totalFlights,
    totalCompletedJumps,
    revenueTotal: pnlRevenueTotal,
    revenuePerJump,
    mixBySource,
    mixByProduct,
    instructorProductivity,
    totalParticipants,
    weatherCancelledCount,
    weatherCancellationPct,
    paymentStages,
  }
}

async function fetchKpiDays(
  supabase: Awaited<ReturnType<typeof createClient>>,
  from: string,
  to: string
): Promise<KpiDayRow[]> {
  const { data, error } = await supabase
    .from('operational_days')
    .select(KPI_DAY_SELECT)
    .gte('date', from)
    .lte('date', to)
    .order('date')

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as KpiDayRow[]
}

/** Month KPI dashboard. month = 'YYYY-MM'. */
export async function getMonthKpis(month: string): Promise<FinanceKpis> {
  const kpiYear = parseInt(month.split('-')[0], 10)
  const kpiMonthNum = parseInt(month.split('-')[1], 10)
  const kpiLastDay = new Date(kpiYear, kpiMonthNum, 0).getDate()
  const kpiFrom = `${month}-01`
  const kpiTo = `${month}-${String(kpiLastDay).padStart(2, '0')}`
  const kpiSupabase = await createClient()

  const [kpiDays, pnl] = await Promise.all([
    fetchKpiDays(kpiSupabase, kpiFrom, kpiTo),
    getMonthPnl(month),
  ])

  return computeKpis(month, kpiDays, pnl.revenueTotal, pnl.revenueByCategory)
}

/** Year KPI dashboard. year is a full 4-digit year. */
export async function getYearKpis(kpiYear: number): Promise<FinanceKpis> {
  const kpiFrom = `${kpiYear}-01-01`
  const kpiTo = `${kpiYear}-12-31`
  const kpiLabel = String(kpiYear)
  const kpiSupabase = await createClient()

  const [kpiDays, pnl] = await Promise.all([
    fetchKpiDays(kpiSupabase, kpiFrom, kpiTo),
    getYearPnl(kpiYear),
  ])

  return computeKpis(kpiLabel, kpiDays, pnl.revenueTotal, pnl.revenueByCategory)
}

// ═══════════════════════════════════════════════════════════════
// TREASURY SPRINT 2 — Daily Cash Close (cierre de caja)
// ═══════════════════════════════════════════════════════════════
//
// "Expected" is Σ payments.amount grouped by method for the participants
// flying on that operational day, computed live (getCashCloseSummary,
// closeCash) via the join payments -> participants -> flights ->
// operational_days. No operational_status filter is applied here — this
// mirrors getArSummary above, which also sums ALL payments regardless of
// status: a deposit collected from a participant who later no-shows or is
// weather-cancelled is real money that entered the till and must still
// reconcile at close time (per the waiver's no-refund terms, see
// clearAutoParticipantItems's doc comment). Filtering by operational_status
// here would make the till "expected" total disagree with the cash actually
// collected, which is the one thing a cash close must never do.
//
// Once closed, `expected` is frozen in cash_close_lines (see migration
// header) and never recomputed — closeCash takes one snapshot; every
// subsequent read (getCashCloseSummary for an already-closed day) returns
// that frozen snapshot, not a fresh live derivation.

import { buildCashCloseRows, computeExpectedByMethod, round2 } from '@/lib/finance/cash-close-engine'
import type { CashCloseSummary, CashCloseLine, CashCloseListItem } from '@/types/domain'

/**
 * Fetches Σ payments.amount grouped by method for every participant flying
 * on `operationalDayId` (same join shape as getArSummary: payments ->
 * participants -> flights -> operational_days). No operational_status
 * filter — see module header above.
 */
async function fetchExpectedByMethodForDay(
  supabase: DbClient,
  operationalDayId: string
): Promise<Record<PaymentMethod, number>> {
  const { data, error } = await supabase
    .from('payments')
    .select('amount, method, participant:participants!inner ( flight:flights!inner ( operational_day_id ) )')
    .eq('participant.flight.operational_day_id', operationalDayId)

  if (error) throw new Error(error.message)

  const payments = (data ?? []).map((p) => ({
    amount: p.amount,
    method: p.method as PaymentMethod,
  }))
  return computeExpectedByMethod(payments)
}

/**
 * Returns the cash-close view for one operational day: if a cash_close
 * already exists, returns the frozen snapshot (expected never recomputed);
 * otherwise returns a "live" summary with expected derived from current
 * payments and counted at 0 (nothing typed yet).
 */
export async function getCashCloseSummary(operationalDayId: string): Promise<CashCloseSummary> {
  const supabase = await createClient()

  const { data: existing, error: existingError } = await supabase
    .from('cash_close')
    .select('id, closed_at, closed_by, notes, cash_close_lines ( method, expected, counted )')
    .eq('operational_day_id', operationalDayId)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)

  if (existing) {
    const expectedMap = {} as Record<PaymentMethod, number>
    const countedMap = {} as Partial<Record<PaymentMethod, number>>
    for (const line of existing.cash_close_lines ?? []) {
      const method = line.method as PaymentMethod
      expectedMap[method] = line.expected
      countedMap[method] = line.counted
    }
    const { rows, totals } = buildCashCloseRows(expectedMap, countedMap)
    const lines: CashCloseLine[] = rows.map((r) => ({
      id: null,
      cashCloseId: existing.id,
      method: r.method,
      expected: r.expected,
      counted: r.counted,
      discrepancy: r.discrepancy,
    }))

    return {
      operationalDayId,
      closed: true,
      cashCloseId: existing.id,
      closedAt: existing.closed_at,
      closedBy: existing.closed_by,
      notes: existing.notes,
      lines,
      totals,
    }
  }

  const expectedMap = await fetchExpectedByMethodForDay(supabase, operationalDayId)
  const { rows, totals } = buildCashCloseRows(expectedMap, {})
  const lines: CashCloseLine[] = rows.map((r) => ({
    id: null,
    cashCloseId: null,
    method: r.method,
    expected: r.expected,
    counted: r.counted,
    discrepancy: r.discrepancy,
  }))

  return {
    operationalDayId,
    closed: false,
    cashCloseId: null,
    closedAt: null,
    closedBy: null,
    notes: null,
    lines,
    totals,
  }
}

/**
 * Closes the till for one operational day: derives `expected` live (see
 * fetchExpectedByMethodForDay), inserts the cash_close header + one
 * cash_close_lines row per payment method, and freezes that snapshot.
 *
 * Relies on cash_close.operational_day_id's UNIQUE constraint to detect
 * "already closed" — a second closeCash for the same day fails the insert
 * with a Postgres unique-violation (code 23505), which is translated into
 * the user-facing error below instead of a raw DB error.
 */
export async function closeCash(params: {
  operationalDayId: string
  counted: Partial<Record<PaymentMethod, number>>
  notes?: string | null
}): Promise<{ error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) return { error: userError.message }
  if (!user) return { error: 'No hay usuario autenticado' }

  const expectedMap = await fetchExpectedByMethodForDay(supabase, params.operationalDayId)
  const { rows } = buildCashCloseRows(expectedMap, params.counted)

  const { data: closeRow, error: insertError } = await supabase
    .from('cash_close')
    .insert({
      operational_day_id: params.operationalDayId,
      closed_at: new Date().toISOString(),
      closed_by: user.id,
      notes: params.notes ?? null,
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return { error: 'La jornada ya está cerrada' }
    }
    return { error: insertError.message }
  }

  const { error: linesError } = await supabase.from('cash_close_lines').insert(
    rows.map((r) => ({
      cash_close_id: closeRow.id,
      method: r.method,
      expected: r.expected,
      counted: r.counted,
    }))
  )

  if (linesError) {
    // Header inserted but lines failed — roll back the header so a retry
    // doesn't hit the UNIQUE constraint for a half-written close.
    await supabase.from('cash_close').delete().eq('id', closeRow.id)
    return { error: linesError.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

/**
 * Updates an existing cash close: ONLY `counted` per line and header
 * `notes`. The frozen `expected` snapshot is never touched — see migration
 * header (20260702000000_treasury_cash_close.sql) for why.
 */
export async function updateCashClose(
  cashCloseId: string,
  params: { counted: Partial<Record<PaymentMethod, number>>; notes?: string | null }
): Promise<{ error?: string }> {
  const supabase = await createClient()

  if (params.notes !== undefined) {
    const { error: notesError } = await supabase
      .from('cash_close')
      .update({ notes: params.notes })
      .eq('id', cashCloseId)
    if (notesError) return { error: notesError.message }
  }

  const updates = Object.entries(params.counted).filter(([, v]) => v !== undefined) as [
    PaymentMethod,
    number,
  ][]

  for (const [method, counted] of updates) {
    const { error } = await supabase
      .from('cash_close_lines')
      .update({ counted })
      .eq('cash_close_id', cashCloseId)
      .eq('method', method)
    if (error) return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

/**
 * Recent cash closes for the "Caja" list view, most recent operational day
 * first, with per-close totals and discrepancy (Σ counted − Σ expected).
 * Does NOT include unclosed recent days — the "Caja" view is expected to
 * call getCashCloseSummary(operationalDayId) separately for "today" (see
 * ENTREGABLE 5 note in the Sprint 2 task): keeping this query scoped to
 * actual cash_close rows avoids a second, differently-shaped query here.
 */
export async function listCashCloses(limit = 30): Promise<CashCloseListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cash_close')
    .select(
      `
      id,
      operational_day_id,
      closed_at,
      closed_by,
      notes,
      operational_day:operational_days ( date ),
      cash_close_lines ( expected, counted )
    `
    )
    .order('closed_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const lines = row.cash_close_lines ?? []
    const totalExpected = round2(lines.reduce((s, l) => s + l.expected, 0))
    const totalCounted = round2(lines.reduce((s, l) => s + l.counted, 0))
    const day = row.operational_day as { date?: string } | null

    return {
      id: row.id,
      operationalDayId: row.operational_day_id,
      operationalDayDate: day?.date ?? '',
      closedAt: row.closed_at,
      closedBy: row.closed_by,
      notes: row.notes,
      totalExpected,
      totalCounted,
      totalDiscrepancy: round2(totalCounted - totalExpected),
    }
  })
}
