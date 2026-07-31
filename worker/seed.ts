import type { IndexEvent, IndexState } from './types'
import { scoreHeadline } from './scorer'

export const BASE_INDEX = 1000

/**
 * Placeholder seed tape so the ticker isn't empty on first load. These are
 * generic, illustrative headlines, NOT verified real news. Swap these for
 * ~10-15 real, current milestones (recent launches, DOE announcements,
 * notable papers) before demoing.
 */
const SEED_HEADLINES = [
  'Startup demonstrates reusable orbital-class rocket stage',
  'DOE announces new grant round for advanced nuclear reactor designs',
  'Research lab reports breakthrough in materials for grid-scale batteries',
  'Defense contractor wins contract for autonomous systems program',
  'University team publishes discovery in semiconductor fabrication',
  'Commercial space company opens new launch site',
  'Federal agency approves expedited permitting for energy infrastructure',
  'AI lab reports milestone in efficient model training',
  'Manufacturer announces expansion of domestic chip fabrication capacity',
  'Investigation opened into satellite component supply delays',
  'Regulatory delay pushes back planned spectrum auction',
  'Startup lays off staff after funding round falls through',
]

const HOURS_BETWEEN_SEED_EVENTS = 9

export function buildSeedState(nowMs: number): IndexState {
  let index = BASE_INDEX
  const events: IndexEvent[] = SEED_HEADLINES.map((headline, i) => {
    const { delta } = scoreHeadline(headline)
    index += delta
    const at = new Date(
      nowMs - (SEED_HEADLINES.length - i) * HOURS_BETWEEN_SEED_EVENTS * 3600_000,
    ).toISOString()
    return {
      id: `seed-${i}`,
      headline,
      delta,
      index,
      source: 'seed',
      at,
    }
  })

  return { index, events }
}
