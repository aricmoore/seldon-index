export interface IndexEvent {
  id: string
  headline: string
  delta: number
  index: number
  source: 'seed' | 'live'
  at: string
}

export interface IndexState {
  index: number
  events: IndexEvent[]
}
