export type PillarCategory =
  | 'Technology & Statecraft'
  | 'Artificial Intelligence'
  | 'American Governance'
  | 'Energy & Infrastructure'
  | 'Science & Innovation'
  | 'Frontier Legal Defense'

export type EventCategory = PillarCategory | 'Other'

export interface CategoryMeta {
  id: PillarCategory
  color: string
  shortLabel: string
  description: string
  keywords: string[]
}

export const PILLAR_CATEGORIES: readonly CategoryMeta[] = [
  {
    id: 'Technology & Statecraft',
    color: '#FFA300',
    shortLabel: 'TECH',
    description:
      'Great-power technology competition: export controls, defense-industrial and defense-tech contracts, national-security space, semiconductor and supply-chain strategy.',
    keywords: [
      'export', 'chip', 'chips', 'semiconductor', 'semiconductors', 'defense', 'contractor', 'contractors',
      'pentagon', 'military', 'satellite', 'satellites', 'sanctions', 'tariff', 'tariffs', 'supply', 'fabrication',
    ],
  },
  {
    id: 'Artificial Intelligence',
    color: '#D63A8C',
    shortLabel: 'AI',
    description: 'AI model development, training, deployment, labs, and AI industry milestones.',
    keywords: [
      'ai', 'model', 'models', 'llm', 'training', 'inference', 'chatbot', 'algorithm', 'algorithms',
      'neural', 'automation', 'robot', 'robots', 'robotics',
    ],
  },
  {
    id: 'American Governance',
    color: '#8265DB',
    shortLabel: 'GOV',
    description:
      'Federal agency operations, permitting, procurement, civic-technology modernization, and regulatory process. Not litigation outcomes; those belong to Frontier Legal Defense.',
    keywords: [
      'agency', 'permitting', 'permit', 'regulatory', 'regulation', 'bureaucracy', 'procurement', 'spectrum',
      'auction', 'government', 'federal', 'congress', 'bill', 'policy',
    ],
  },
  {
    id: 'Energy & Infrastructure',
    color: '#268B41',
    shortLabel: 'ENERGY',
    description: 'Energy generation, grid, nuclear, batteries, and physical infrastructure development.',
    keywords: [
      'energy', 'grid', 'nuclear', 'reactor', 'reactors', 'battery', 'batteries', 'solar', 'infrastructure',
      'power', 'doe', 'pipeline', 'transmission',
    ],
  },
  {
    id: 'Science & Innovation',
    color: '#4997D0',
    shortLabel: 'SCI',
    description: 'Basic and applied research, space exploration, materials science, and university/lab discoveries.',
    keywords: [
      'research', 'discovery', 'discovers', 'university', 'lab', 'rocket', 'launch', 'launches', 'orbital',
      'space', 'nasa', 'materials', 'science', 'scientists', 'publishes',
    ],
  },
  {
    id: 'Frontier Legal Defense',
    color: '#3A4A6B',
    shortLabel: 'LEGAL',
    description:
      'Litigation and regulatory enforcement actions for or against frontier technology: AI copyright suits, autonomous-vehicle regulatory fights, antitrust against tech companies, court rulings on tech policy. Not military defense.',
    keywords: [
      'lawsuit', 'sues', 'court', 'ruling', 'rules', 'antitrust', 'copyright', 'litigation', 'appeals',
      'injunction', 'settlement', 'plaintiff', 'lawsuit',
    ],
  },
] as const

export const PILLAR_IDS: PillarCategory[] = PILLAR_CATEGORIES.map((c) => c.id)

export function getCategoryMeta(id: EventCategory): CategoryMeta | undefined {
  return PILLAR_CATEGORIES.find((c) => c.id === id)
}
