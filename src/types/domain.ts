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
  createdAt: string
}

export interface Waiver {
  id: string
  participantId: string
  signedAt: string
  pdfUrl: string | null
  signatureUrl: string | null
  accepted: boolean
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
