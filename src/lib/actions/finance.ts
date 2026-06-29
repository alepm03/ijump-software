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

// ═══════════════════════════════════════════════════════════════
// FINANCE V2 — Expense categories
// ═══════════════════════════════════════════════════════════════

function rowToExpenseCategory(row: {
  id: string
  code: string
  name: string
  group_type: string
  subgroup?: string | null  // optional until migration 20260629 is applied and types regenerated
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

/** Day P&L for a single operational day (Europe/Madrid, ISO 8601) */
export async function getDayPnl(date: string): Promise<ProfitAndLoss> {
  const supabase = await createClient()
  const [days, expenses, categories] = await Promise.all([
    fetchPnlDays(supabase, date, date),
    fetchPnlExpenses(supabase, date, date),
    fetchCategories(supabase),
  ])

  return buildPnl({ periodLabel: date, days, expenses, categories })
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
  const [days, expenses, categories] = await Promise.all([
    fetchPnlDays(supabase, from, to),
    fetchPnlExpenses(supabase, from, to),
    fetchCategories(supabase),
  ])

  return buildPnl({ periodLabel, days, expenses, categories })
}

/** Month P&L. month is 'YYYY-MM'. */
export async function getMonthPnl(month: string): Promise<ProfitAndLoss> {
  const year = parseInt(month.split('-')[0], 10)
  const monthNum = parseInt(month.split('-')[1], 10)
  const lastDay = new Date(year, monthNum, 0).getDate()
  const from = `${month}-01`
  const to = `${month}-${String(lastDay).padStart(2, '0')}`

  const supabase = await createClient()
  const [days, expenses, categories] = await Promise.all([
    fetchPnlDays(supabase, from, to),
    fetchPnlExpenses(supabase, from, to),
    fetchCategories(supabase),
  ])

  return buildPnl({ periodLabel: month, days, expenses, categories })
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
  const [days, expenses, categories] = await Promise.all([
    fetchPnlDays(supabase, from, to),
    fetchPnlExpenses(supabase, from, to),
    fetchCategories(supabase),
  ])

  return buildPnl({ periodLabel, days, expenses, categories })
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
  participants: KpiParticipantRow[]
}

interface KpiDayRow {
  id: string
  date: string
  flights: KpiFlightRow[]
}

const SOURCE_LABELS: Record<string, string> = {
  DIRECT:   'Directo',
  GROUPON:  'Groupon',
  BONO:     'Bono',
  PROMO:    'Promo',
  SMARTBOX: 'Smartbox',
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
      totalFlights++
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
      label: SOURCE_LABELS[source] ?? source,
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
