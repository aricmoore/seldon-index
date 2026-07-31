const AGENCIES = [
  'energy-department',
  'federal-energy-regulatory-commission',
  'nuclear-regulatory-commission',
  'national-science-foundation',
  'federal-communications-commission',
]

const FETCH_TIMEOUT_MS = 4000

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function countDocuments(gte: string, lte: string): Promise<number | null> {
  const params = new URLSearchParams()
  params.set('per_page', '1')
  params.set('conditions[publication_date][gte]', gte)
  params.set('conditions[publication_date][lte]', lte)
  for (const agency of AGENCIES) params.append('conditions[agencies][]', agency)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`, {
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { count?: number }
    return typeof data.count === 'number' ? data.count : null
  } catch (err) {
    console.error('federal register fetch failed', err)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export interface ExternalSignals {
  generatedAt: string
  stale: boolean
  status: 'ok' | 'degraded'
  signals: Array<{
    label: string
    count: number
    countPrevious: number
    sourceUrl: string
  }>
}

export async function fetchExternalSignals(): Promise<ExternalSignals | null> {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400_000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000)

  const [current, previous] = await Promise.all([
    countDocuments(isoDate(weekAgo), isoDate(now)),
    countDocuments(isoDate(twoWeeksAgo), isoDate(weekAgo)),
  ])

  if (current === null || previous === null) return null

  const params = new URLSearchParams()
  for (const agency of AGENCIES) params.append('conditions[agencies][]', agency)

  return {
    generatedAt: now.toISOString(),
    stale: false,
    status: 'ok',
    signals: [
      {
        label: 'Federal Regulatory Pulse · DOE/FERC/NRC/NSF/FCC, 7d',
        count: current,
        countPrevious: previous,
        sourceUrl: `https://www.federalregister.gov/documents/search?${params.toString()}`,
      },
    ],
  }
}
