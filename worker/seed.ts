import type { EventCategory, IndexEvent, IndexState, PillarCategory } from './types'
import { scoreHeadline } from './scorer'

export const BASE_INDEX = 1000
export const BASE_SUB_INDEX = 1000

/**
 * Placeholder seed tape so the ticker isn't empty on first load. These are
 * generic, illustrative headlines, NOT verified real news. Swap these for
 * ~10-15 real, current milestones (recent launches, DOE announcements,
 * notable papers) before demoing.
 */
const SEED_HEADLINES: Array<{ headline: string; category: EventCategory }> = [
  { headline: 'Startup demonstrates reusable orbital-class rocket stage', category: 'Space' },
  { headline: 'DOE announces new grant round for advanced nuclear reactor designs', category: 'Energy' },
  { headline: 'Research lab reports breakthrough in materials for grid-scale batteries', category: 'Energy' },
  { headline: 'Defense contractor wins contract for autonomous systems program', category: 'Defense' },
  { headline: 'University team publishes discovery in semiconductor fabrication', category: 'AI' },
  { headline: 'Commercial space company opens new launch site', category: 'Space' },
  { headline: 'Federal agency approves expedited permitting for energy infrastructure', category: 'Energy' },
  { headline: 'AI lab reports milestone in efficient model training', category: 'AI' },
  { headline: 'Manufacturer announces expansion of domestic chip fabrication capacity', category: 'Defense' },
  { headline: 'Investigation opened into satellite component supply delays', category: 'Space' },
  { headline: 'Regulatory delay pushes back planned spectrum auction', category: 'Other' },
  { headline: 'Startup lays off staff after funding round falls through', category: 'Other' },
]

const HOURS_BETWEEN_SEED_EVENTS = 9

export function buildSeedState(nowMs: number): IndexState {
  let index = BASE_INDEX
  const subIndices: Record<PillarCategory, number> = {
    AI: BASE_SUB_INDEX,
    Energy: BASE_SUB_INDEX,
    Defense: BASE_SUB_INDEX,
    Space: BASE_SUB_INDEX,
  }

  const events: IndexEvent[] = SEED_HEADLINES.map(({ headline, category }, i) => {
    const { delta } = scoreHeadline(headline)
    index += delta
    if (category !== 'Other') subIndices[category] += delta
    const at = new Date(
      nowMs - (SEED_HEADLINES.length - i) * HOURS_BETWEEN_SEED_EVENTS * 3600_000,
    ).toISOString()
    return {
      id: `seed-${i}`,
      headline,
      delta,
      index,
      source: 'seed',
      category,
      at,
    }
  })

  return { index, subIndices, events }
}
