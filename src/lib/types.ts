/** Shape of the public, unauthenticated read endpoint (PRD §7.2). */
export type PublicState = 'live' | 'stale' | 'closed' | 'unavailable'

export type PublicTier = {
  ordinal: number
  label: string
  description: string
  color: string
  /** How many tiers exist in total, so the meter can size itself. */
  of: number
}

export type PublicStatus = {
  location: { name: string; timezone: string }
  state: PublicState
  /**
   * Null when closed or unavailable. Note there is deliberately no count and
   * no percentage on this wire format — see PRD-FIX #4 in the migrations.
   */
  tier: PublicTier | null
  lastUpdatedAt: string | null
  staleAfterMinutes: number
  opensAt: string | null
  serverTime: string
}

/** Shape returned to the authenticated staff console. */
export type ConsoleSnapshot = {
  count: number
  capacity: number
  pct: number
  overCapacity: boolean
  businessDate: string
  lastUpdatedAt: string
  staleAfterMinutes: number
  isStale: boolean
  isOpen: boolean
  tier: { ordinal: number; label: string; description: string; color: string } | null
  undoable: { id: number; kind: string; delta: number; at: string } | null
}
