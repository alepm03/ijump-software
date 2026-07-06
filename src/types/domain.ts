// Domain types — independent of DB schema, used across the application

export type PackageType =
  | 'SOLO'
  | 'HANDYCAM'
  | 'VIDEO_EXTERNO'
  | 'FOTOS'
  | 'HANDYCAM_FOTOS'

export type ReservationSource =
  | 'DIRECT'
  | 'BONO'
  | 'PROMO'
  | 'GROUPON'
  | 'SMARTBOX'
  | 'WONDERBOX'
  | 'JUMPING'
  | 'FREEDOM'

/**
 * All reservation sources, in the order sale_channels.sort_order defines
 * (see 20260622000000_finance_expense_model.sql) — DIRECT-kind channels
 * first (no commission), then PLATFORM-kind channels grouped together.
 * This is the order the "Fuente" dropdown renders in.
 */
export const RESERVATION_SOURCES: ReservationSource[] = [
  'DIRECT',
  'BONO',
  'PROMO',
  'GROUPON',
  'SMARTBOX',
  'WONDERBOX',
  'JUMPING',
  'FREEDOM',
]

export const RESERVATION_SOURCE_LABELS: Record<ReservationSource, string> = {
  DIRECT: 'Directo',
  BONO: 'Bono',
  PROMO: 'Promo',
  GROUPON: 'Groupon',
  SMARTBOX: 'Smartbox',
  WONDERBOX: 'Wonder Box',
  JUMPING: 'Jumping',
  FREEDOM: 'Freedom',
}

export type PaymentMethod = 'EFECTIVO' | 'TARJETA' | 'BIZUM' | 'TRANSFERENCIA' | 'GROUPON'

export type PaymentStage = 'RESERVA' | 'LIQUIDACION' | 'SUPLEMENTO'

export type OperationalStatus =
  | 'PENDING'
  | 'CHECKED_IN'
  | 'WAIVER_SIGNED'
  | 'BRIEFED'
  | 'GEARED_UP'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'WEATHER_CANCELLED'

export type FlightStatus =
  | 'SCHEDULED'
  | 'BOARDING'
  | 'IN_AIR'
  | 'COMPLETED'
  | 'DELAYED'
  | 'CANCELLED'

export type WeatherStatus = 'OK' | 'MARGINAL' | 'CANCELLED'

export interface OperationalDay {
  id: string
  date: string // ISO 8601 date: YYYY-MM-DD
  weatherStatus: WeatherStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Flight {
  id: string
  operationalDayId: string
  flightNumber: number
  estimatedDepartureTime: string | null // HH:MM
  actualDepartureTime: string | null
  status: FlightStatus
  orderIndex: number
  /** Back-to-back flight: rented equipment needed → EQUIPOS cost applies (25 €/jump). */
  isBackToBack: boolean
  createdAt: string
}

export interface Participant {
  id: string
  reservationGroupId: string | null
  flightId: string | null
  fullName: string
  phone: string | null
  email: string | null
  packageType: PackageType
  weight: number | null
  overweightFee: number
  operationalStatus: OperationalStatus
  assignedInstructorId: string | null
  waiverSigned: boolean
  checkInCompleted: boolean
  gearedUp: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
  // Reservations module — see docs/reservas/RESERVAS_MODULE_PLAN_v1.md
  // A participant IS a lead when leadStatus is not null (flightId is null until confirmed).
  leadStatus: LeadStatus | null
  preferredDate: string | null // YYYY-MM-DD
  preferredTime: string | null // HH:MM
  confirmedDate: string | null
  confirmedTime: string | null
  depositPaid: boolean
  channel: Channel
  createdBy: string | null
  token: string | null
}

export interface ReservationGroup {
  id: string
  payerName: string | null
  source: ReservationSource
  notes: string | null
  createdAt: string
  participants?: Participant[]
  // Reservations module
  contactPhone: string | null
  contactEmail: string | null
  channel: Channel
  createdBy: string | null
}

export interface Payment {
  id: string
  participantId: string
  amount: number
  method: PaymentMethod
  stage: PaymentStage
  notes: string | null
  createdAt: string
}

export interface Instructor {
  id: string
  name: string
  active: boolean
  feePerJump: number
  createdAt: string
}

// ─── Finance ────────────────────────────────────────────────

export interface FinancialSettings {
  id: string
  fuelPricePerFlight: number
  hangarPricePerDay: number
  packerFeePerJump: number
  updatedAt: string
}

export type ExpenseType = 'FUEL_OVERRIDE' | 'HANGAR_OVERRIDE' | 'CUSTOM'

export interface DayExpense {
  id: string
  operationalDayId: string
  type: ExpenseType
  description: string | null
  amount: number
  createdAt: string
}

export interface InstructorPayout {
  instructorId: string
  name: string
  jumps: number
  feePerJump: number
  total: number
}

export interface DayFinancials {
  date: string
  operationalDayId: string
  // Revenue
  totalRevenue: number
  revenueByMethod: Record<PaymentMethod, number>
  // Costs
  fuelCost: number
  fuelIsOverride: boolean
  fuelOverrideExpenseId: string | null
  hangarCost: number
  hangarIsOverride: boolean
  hangarOverrideExpenseId: string | null
  instructorPayouts: InstructorPayout[]
  totalInstructorCost: number
  packerCost: number
  customExpenses: DayExpense[]
  totalCosts: number
  // Net
  netProfit: number
}

export interface MonthFinancialSummary {
  date: string
  totalRevenue: number
  totalCosts: number
  netProfit: number
  jumpCount: number
  flightCount: number
}

export interface DayExpenseWithDate extends DayExpense {
  date: string // YYYY-MM-DD of the operational day
}

export interface MonthFinancialsDetail {
  month: string
  // Counts
  dayCount: number
  flightCount: number
  jumpCount: number
  // Revenue
  totalRevenue: number
  revenueByMethod: Record<PaymentMethod, number>
  // Fixed costs (may include per-day overrides)
  totalFuelCost: number
  totalHangarCost: number
  totalPackerCost: number
  // Instructors
  instructorPayouts: InstructorPayout[]
  totalInstructorCost: number
  // Custom expenses
  customExpenses: DayExpenseWithDate[]
  totalCustomCost: number
  // Totals
  totalCosts: number
  netProfit: number
}

// ─── Finance v2 types ────────────────────────────────────────

export type ProductCategory =
  | 'TANDEM_BASE'
  | 'CAMERA_HANDYCAM'
  | 'CAMERA_EXTERNAL'
  | 'PHOTOS'
  | 'OVERWEIGHT'
  | 'GROUND_REPORT'
  | 'OTHER'

export type ExpenseGroup = 'COSTES_OPERATIVOS' | 'GENERALES'

export type RateBasis = 'PER_FLIGHT' | 'PER_JUMP' | 'FIXED_PER_DAY' | 'FIXED_PER_MONTH'

export type ChannelKind = 'DIRECT' | 'PLATFORM'

/**
 * Sale channel (Reserva directa, Bono, Promo, Groupon, Smartbox, ...).
 * DIRECT channels carry no commission; PLATFORM channels do. Adjustable
 * per-channel %, decoupled from ReservationSource. `commissionPct` is in
 * percentage points (e.g. 15 = 15%); null = pending / not applicable.
 */
export interface SaleChannel {
  id: string
  code: string
  name: string
  channelKind: ChannelKind
  commissionPct: number | null
  active: boolean
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  code: string
  name: string
  category: ProductCategory
  basePrice: number
  vatRate: number | null
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ParticipantItem {
  id: string
  participantId: string
  productId: string
  quantity: number
  unitPrice: number
  vatRate: number | null
  /** GENERATED column (quantity * unit_price); never written by client code */
  amount: number
  notes: string | null
  createdAt: string
  /**
   * True when this line was created by the packageType -> products
   * auto-itemization engine (Sprint 1 treasury). False for lines added by
   * hand in the manifest (e.g. an OVERWEIGHT supplement). Lets a packageType
   * change re-sync only the automatic lines, and lets cancellation flows
   * delete only the automatic lines without touching manual additions.
   */
  autoGenerated: boolean
}

/**
 * Channel × product net price matrix (Sprint 1 treasury). Keyed by
 * ReservationSource (not sale_channels.id) — see migration
 * 20260701000000_treasury_itemization_ar.sql for the reasoning.
 * unitPrice is the NET amount iJump receives for that product when sold
 * through that channel (DIRECT = catalog price; platform = agreed net,
 * per the 2026-07-01 pricing decision — no commission is ever registered).
 */
export interface ChannelProductPrice {
  id: string
  channel: ReservationSource
  productId: string
  unitPrice: number
  active: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ExpenseCategory {
  id: string
  code: string
  name: string
  groupType: ExpenseGroup
  subgroup: string | null
  defaultRate: number | null
  rateBasis: RateBasis | null
  sortOrder: number
  active: boolean
}

export interface Expense {
  id: string
  expenseCategoryId: string
  /** null = fixed monthly cost not tied to an operational day */
  operationalDayId: string | null
  incurredOn: string // YYYY-MM-DD
  description: string | null
  supplier: string | null
  sociedad: string | null
  amount: number
  vatRate: number | null
  createdAt: string
  updatedAt: string
}

// ─── P&L shapes ─────────────────────────────────────────────

/**
 * Revenue grouped by product_category for participants WITH items,
 * plus a synthetic 'SIN_DESGLOSE' entry for participants WITHOUT items
 * (whose revenue comes from payments under the COALESCE rule).
 *
 * Invariant: sum of all values === period revenueTotal.
 */
export type RevenueByCategory = Partial<Record<ProductCategory, number>> & {
  SIN_DESGLOSE?: number
}

/** One cost category line inside a P&L group */
export interface CostCategoryLine {
  categoryCode: string
  name: string
  group: ExpenseGroup
  subgroup: string | null
  amount: number
}

/** One EBITDA group (COSTES_OPERATIVOS | GENERALES) with its categories */
export interface CostGroup {
  group: ExpenseGroup
  total: number
  categories: CostCategoryLine[]
  /** Pre-computed subtotals per subgroup (only populated when the group has subgroups) */
  subgroupTotals: Record<string, number>
}

/** Full P&L for a period (day / ISO week / month / year) */
export interface ProfitAndLoss {
  periodLabel: string
  revenueTotal: number
  revenueByCategory: RevenueByCategory
  costGroups: CostGroup[]
  costsTotal: number
  ebitda: number
  ebitdaMarginPct: number
}

// ─── Finance KPI dashboard types ─────────────────────────────────

/** Mix entry for a single source or product category */
export interface MixEntry {
  label: string
  count: number
  share: number // 0–100
}

/** Instructor productivity row */
export interface InstructorProductivity {
  instructorId: string
  name: string
  jumps: number
  shareOfTotal: number // 0–100
}

/** Depósitos vs liquidación breakdown */
export interface PaymentStageBreakdown {
  reserva: number
  liquidacion: number
  suplemento: number
  total: number
}

/** Full KPI dashboard payload for a period */
export interface FinanceKpis {
  /** Period label identical to ProfitAndLoss.periodLabel */
  periodLabel: string

  // Ocupación de vuelo
  /** Average completed clients per flight (0 if no flights) */
  avgClientsPerFlight: number
  /** % occupancy vs capacity-2: avgClientsPerFlight / 2 × 100 */
  occupancyPct: number
  totalFlights: number
  totalCompletedJumps: number

  // Ingreso medio por salto
  revenueTotal: number
  /** revenueTotal / totalCompletedJumps (0 if no jumps) */
  revenuePerJump: number

  // Mix por origen (reservation_groups.source)
  mixBySource: MixEntry[]

  // Mix por producto (revenueByCategory from P&L)
  mixByProduct: MixEntry[]

  // Productividad por instructor
  instructorProductivity: InstructorProductivity[]

  // % cancelación meteo
  totalParticipants: number
  weatherCancelledCount: number
  /** weatherCancelledCount / totalParticipants × 100 */
  weatherCancellationPct: number

  // Depósitos vs liquidación
  paymentStages: PaymentStageBreakdown
}

// ─── End finance KPI types ────────────────────────────────────────

// ─── End finance v2 types ────────────────────────────────────────

// ─── Reservations module (Leads → Manifest) ──────────────────
// See docs/reservas/RESERVAS_MODULE_PLAN_v1.md and CHECKLIST.md

export type LeadStatus =
  | 'NEW'
  | 'TENTATIVE'
  | 'CONFIRMED'
  | 'RESCHEDULE_NEEDED'
  | 'CANCELLED'
  | 'NO_SHOW'

export type Channel = 'WEB_BOT' | 'WHATSAPP_BOT' | 'STAFF'

// Availability engine — see src/lib/availability/availability-engine.ts (R2)
export type DateClass = 'CONFIRMABLE' | 'TENTATIVE_ONLY' | 'UNAVAILABLE' | 'NOT_OPERATING'

export interface AvailabilityPolicy {
  maxClientsPerFlight: number
  maxFlightsPerDay: number
  operatingWeekdays: number[] // e.g. [6, 0] = Saturday and Sunday
  flightIntervalMinutes: number // minutes between auto-scheduled flights — configurable per season
}

export interface DayLoad {
  date: string
  weatherStatus: WeatherStatus
  flights: { id: string; activeParticipantCount: number }[]
}

export interface DaySlots {
  date: string
  isOperatingDay: boolean
  weatherCancelled: boolean
  existingFlights: number
  freeSeatsInExistingFlights: number
  potentialNewFlights: number
  totalFreeSeats: number
  bookable: boolean
}

export interface BusinessSetting {
  key: string
  value: string
  description: string | null
  updatedAt: string
}

export interface ApiKey {
  id: string
  label: string
  keyPrefix: string
  scopes: string[]
  rateLimitPerMin: number
  active: boolean
  lastUsedAt: string | null
  createdAt: string
  revokedAt: string | null
}

// Lead row with the relations the /reservas UI needs to render a row
export interface LeadWithDetails extends Participant {
  reservationGroup: ReservationGroup | null
  availability?: DateClass
}

// ─── End reservations module types ───────────────────────────

export type WaiverDocumentType = 'WAIVER' | 'RGPD'
export type WaiverStatus = 'PENDING' | 'COMPLETED' | 'EXPIRED'

// Fields collected from the client during the signing flow.
// Kept as a flat interface so each template can use/omit what it needs.
export interface WaiverFormData {
  // Personal data (both documents)
  fullName: string
  email: string
  phone?: string
  // WAIVER-specific
  dni?: string
  dateOfBirth?: string
  address?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  province?: string
  emergencyContactRelationship?: string
  sportsLicenseNumber?: string
  // Health/safety declaration checkboxes (WAIVER)
  healthDeclaration?: Record<string, boolean>
  // Consent checkboxes (RGPD / Consentimiento Informado)
  consents?: Record<string, boolean>
}

export interface Waiver {
  id: string
  participantId: string
  token: string
  documentType: WaiverDocumentType
  status: WaiverStatus
  formData: WaiverFormData | null
  pdfUrl: string | null
  signatureUrl: string | null
  signedAt: string
  createdAt: string
}

export interface DailySummary {
  totalFlights: number
  totalJumps: number
  jumpsBySource: Record<ReservationSource, number>
  handycamCount: number
  externalCameraCount: number
  overweightCount: number
  totalRevenue: number
  revenueByMethod: Record<PaymentMethod, number>
}

// Calendar summary — lightweight, for the month view
export interface OperationalDaySummary {
  id: string
  date: string
  weatherStatus: WeatherStatus
  notes: string | null
  flightCount: number
  jumpCount: number
}

// Extended types with loaded relations
export interface ParticipantWithDetails extends Participant {
  instructor: Instructor | null
  payments: Payment[]
  reservationGroup: ReservationGroup | null
  /** Sale line items (Sprint 1 treasury) — used to derive the AR balance. */
  items: ParticipantItem[]
}

export interface FlightWithParticipants extends Flight {
  participants: ParticipantWithDetails[]
}

export interface OperationalDayWithDetails extends OperationalDay {
  flights: FlightWithParticipants[]
}

// ─── Treasury — Accounts Receivable (Sprint 1) ────────────────

/**
 * One row in the "Cobros" (AR) view: a participant whose
 * Σ(items) − Σ(payments) balance is > 0. `owedBy` distinguishes who the
 * pending amount is actually owed by — a platform client (Groupon/
 * Smartbox/...) only owes iJump the ticket suplements on-site; the
 * itemized base sale is a receivable AGAINST THE PLATFORM, not the client.
 */
export interface ArReceivableRow {
  participantId: string
  fullName: string
  operationalDayDate: string | null
  flightId: string | null
  source: ReservationSource
  /** 'CLIENT' for DIRECT/BONO/PROMO, 'PLATFORM' for GROUPON/SMARTBOX/... */
  owedBy: 'CLIENT' | 'PLATFORM'
  itemsTotal: number
  paymentsTotal: number
  balance: number
}

export interface ArSummary {
  rows: ArReceivableRow[]
  totalPendingClient: number
  totalPendingPlatform: number
  byPlatform: Record<string, number>
}

// ─── Treasury — Daily Cash Close (Sprint 2) ───────────────────

/** Header row: one per operational day, created when the till is closed. */
export interface CashClose {
  id: string
  operationalDayId: string
  closedAt: string
  closedBy: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** One payment-method line within a cash close (or a live/unclosed summary). */
export interface CashCloseLine {
  id: string | null
  cashCloseId: string | null
  method: PaymentMethod
  /** Frozen snapshot at closing time (or live-derived if not yet closed). */
  expected: number
  /** What the till physically held. 0 before it has been counted. */
  counted: number
  /** counted − expected, derived, never stored. */
  discrepancy: number
}

/**
 * Full cash-close view for one operational day, used by both the "already
 * closed" (snapshot) and "not yet closed" (live) cases in getCashCloseSummary.
 * `closed` distinguishes the two; closedAt/closedBy/notes are null when live.
 */
export interface CashCloseSummary {
  operationalDayId: string
  closed: boolean
  cashCloseId: string | null
  closedAt: string | null
  closedBy: string | null
  notes: string | null
  lines: CashCloseLine[]
  totals: {
    expected: number
    counted: number
    discrepancy: number
  }
}

/** One recent cash close row for the "Caja" list view. */
export interface CashCloseListItem {
  id: string
  operationalDayId: string
  operationalDayDate: string
  closedAt: string
  closedBy: string
  notes: string | null
  totalExpected: number
  totalCounted: number
  totalDiscrepancy: number
}
