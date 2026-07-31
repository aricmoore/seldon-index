import type { EventCategory, IndexEvent, IndexState, PillarCategory } from './types'
import { PILLAR_IDS } from './categories'
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
  { headline: 'Commerce Department tightens export controls on advanced chipmaking equipment', category: 'Technology & Statecraft' },
  { headline: 'Defense contractor wins contract for autonomous systems program', category: 'Technology & Statecraft' },
  { headline: 'AI lab reports milestone in efficient model training', category: 'Artificial Intelligence' },
  { headline: 'Startup raises major funding round for frontier AI research', category: 'Artificial Intelligence' },
  { headline: 'Federal agency launches pilot to digitize permitting backlog', category: 'American Governance' },
  { headline: 'Regulatory delay pushes back planned spectrum auction', category: 'American Governance' },
  { headline: 'DOE announces new grant round for advanced nuclear reactor designs', category: 'Energy & Infrastructure' },
  { headline: 'Research lab reports breakthrough in materials for grid-scale batteries', category: 'Energy & Infrastructure' },
  { headline: 'Startup demonstrates reusable orbital-class rocket stage', category: 'Science & Innovation' },
  { headline: 'University team publishes discovery in semiconductor fabrication', category: 'Science & Innovation' },
  { headline: 'Federal court allows copyright lawsuit against AI developer to proceed', category: 'Frontier Legal Defense' },
  { headline: 'Appeals court rules against agency bid to regulate autonomous-vehicle testing', category: 'Frontier Legal Defense' },
]

const HOURS_BETWEEN_SEED_EVENTS = 9

// Shared by seeding, submitting, and deleting: given an ordered list of events
// (each already carrying its own delta/category), replays them from the base
// totals to derive the running index, each sub-index, and every event's
// snapshotted `index` value. Used after a delete to retroactively recompute
// history rather than leaving the remaining tape's numbers stale.
export function replayEvents(events: IndexEvent[]): {
  index: number
  subIndices: Record<PillarCategory, number>
  events: IndexEvent[]
} {
  let index = BASE_INDEX
  const subIndices = Object.fromEntries(PILLAR_IDS.map((id) => [id, BASE_SUB_INDEX])) as Record<
    PillarCategory,
    number
  >

  const replayed = events.map((e) => {
    index += e.delta
    if (e.category && e.category !== 'Other') subIndices[e.category as PillarCategory] += e.delta
    return { ...e, index }
  })

  return { index, subIndices, events: replayed }
}

export function buildSeedState(nowMs: number): IndexState {
  const rawEvents: IndexEvent[] = SEED_HEADLINES.map(({ headline, category }, i) => {
    const { delta } = scoreHeadline(headline)
    const at = new Date(
      nowMs - (SEED_HEADLINES.length - i) * HOURS_BETWEEN_SEED_EVENTS * 3600_000,
    ).toISOString()
    return {
      id: `seed-${i}`,
      headline,
      delta,
      index: 0,
      source: 'seed',
      category,
      at,
    }
  })

  return replayEvents(rawEvents)
}
