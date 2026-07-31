export type EventCategory = 'AI' | 'Energy' | 'Defense' | 'Space' | 'Other'
export type PillarCategory = Exclude<EventCategory, 'Other'>

export interface IndexEvent {
  id: string
  headline: string
  delta: number
  index: number
  source: 'seed' | 'live' | 'rejected' | 'easter-egg'
  at: string
  category?: EventCategory
  rationale?: string
}

export interface IndexState {
  index: number
  subIndices: Record<PillarCategory, number>
  events: IndexEvent[]
}
