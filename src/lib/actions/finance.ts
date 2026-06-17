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
} from '@/types/domain'

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
