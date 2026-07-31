import type { EventCategory, PillarCategory } from './categories'

export type { EventCategory, PillarCategory } from './categories'

export interface IndexEvent {
  id: string
  headline: string
  delta: number
  index: number
  source: 'seed' | 'live' | 'rejected'
  at: string
  category?: EventCategory
  rationale?: string
  submittedBy?: string
}

export interface IndexState {
  index: number
  subIndices: Record<PillarCategory, number>
  events: IndexEvent[]
}
