// Domain types — independent of DB schema, used across the application

export type PackageType =
  | 'SOLO'
  | 'HANDYCAM'
  | 'VIDEO_EXTERNO'
  | 'FOTOS'
  | 'HANDYCAM_FOTOS'

export type ReservationSource = 'DIRECT' | 'GROUPON' | 'BONO' | 'PROMO' | 'SMARTBOX'

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
}

export interface ReservationGroup {
  id: string
  payerName: string | null
  source: ReservationSource
  notes: string | null
  createdAt: string
  participants?: Participant[]
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
}

export interface FlightWithParticipants extends Flight {
  participants: ParticipantWithDetails[]
}

export interface OperationalDayWithDetails extends OperationalDay {
  flights: FlightWithParticipants[]
}
