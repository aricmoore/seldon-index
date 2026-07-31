const POSITIVE_TERMS: Record<string, number> = {
  breakthrough: 18,
  launch: 15,
  launches: 15,
  funding: 12,
  approved: 10,
  approves: 10,
  record: 14,
  partnership: 8,
  expansion: 9,
  expands: 9,
  patent: 9,
  discovery: 16,
  discovers: 16,
  milestone: 10,
  grant: 9,
  investment: 11,
  invests: 11,
  opens: 6,
  wins: 8,
  win: 8,
  success: 8,
  successful: 8,
  reusable: 7,
  reactor: 6,
  automation: 5,
}

const NEGATIVE_TERMS: Record<string, number> = {
  delay: -10,
  delays: -10,
  delayed: -10,
  cancel: -16,
  canceled: -16,
  cancelled: -16,
  layoffs: -14,
  lawsuit: -12,
  sues: -12,
  breach: -15,
  hack: -15,
  hacked: -15,
  failure: -14,
  fails: -14,
  failed: -14,
  shutdown: -18,
  shuts: -18,
  ban: -12,
  banned: -12,
  tariff: -9,
  tariffs: -9,
  recall: -13,
  recalled: -13,
  investigation: -11,
  investigated: -11,
  decline: -9,
  declines: -9,
  cut: -8,
  cuts: -8,
  resign: -7,
  resigns: -7,
  explosion: -17,
  grounded: -13,
}

const MAX_ABS_DELTA = 40

// Deterministic fallback so a headline that hits no keyword still moves the
// tape a little during a demo, instead of always landing on exactly zero.
function neutralNudge(headline: string): number {
  let hash = 0
  for (let i = 0; i < headline.length; i++) {
    hash = (hash * 31 + headline.charCodeAt(i)) | 0
  }
  return (Math.abs(hash) % 11) - 5
}

export interface ScoreResult {
  delta: number
  matched: string[]
}

export function scoreHeadline(headline: string): ScoreResult {
  const words = headline.toLowerCase().match(/[a-z']+/g) ?? []
  let sum = 0
  const matched: string[] = []

  for (const word of words) {
    if (word in POSITIVE_TERMS) {
      sum += POSITIVE_TERMS[word]
      matched.push(word)
    } else if (word in NEGATIVE_TERMS) {
      sum += NEGATIVE_TERMS[word]
      matched.push(word)
    }
  }

  if (matched.length === 0) {
    sum = neutralNudge(headline)
  }

  const delta = Math.max(-MAX_ABS_DELTA, Math.min(MAX_ABS_DELTA, Math.round(sum)))
  return { delta, matched }
}
