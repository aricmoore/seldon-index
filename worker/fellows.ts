export interface FellowProfile {
  name: string
  title: string
}

export const FELLOW_ROSTER: FellowProfile[] = [
  { name: 'Samuel Hammond', title: 'Director of AI & Chief Economist' },
  { name: 'Zach Graves', title: 'President & CEO' },
  { name: 'Dan Lips', title: 'Senior Fellow' },
  { name: 'Luke Hogg', title: 'Senior Fellow' },
  { name: 'Soren Dayton', title: 'Director of American Governance' },
  { name: 'Daniel King', title: 'Research Fellow' },
]

export interface FellowMentionSummary {
  name: string
  title: string
  confirmed: number
  possible: number
  total: number
}

export interface FellowMentions {
  generatedAt: string
  stale: boolean
  fellows: FellowMentionSummary[]
}
