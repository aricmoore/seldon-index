export interface FellowCitation {
  title: string
  date: string
  collection: string
  packageId: string
  link: string
  confidence: 'confirmed' | 'possible'
}

// Requiring the org name to co-occur with the person's name is what actually
// eliminates false positives from common-name historical namesakes (tested:
// plain name + collection filter alone still surfaced unrelated 19th/20th
// century records for common names). This trades recall for precision on
// purpose: a missed real citation is safe, a wrong one shown live is not.
const ORG_NAME = 'Foundation for American Innovation'

interface GovInfoSearchResult {
  title?: string
  dateIssued?: string
  collectionCode?: string
  packageId?: string
}

interface GovInfoSearchResponse {
  results?: GovInfoSearchResult[]
  error?: { message?: string }
}

async function searchGovInfo(name: string, apiKey: string): Promise<FellowCitation[]> {
  const safeName = name.replace(/"/g, '')
  const res = await fetch(`https://api.govinfo.gov/search?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `"${safeName}" AND "${ORG_NAME}"`,
      pageSize: 3,
      offsetMark: '*',
      historical: true,
      resultLevel: 'default',
    }),
  })

  if (!res.ok) {
    throw new Error(`GovInfo search failed: ${res.status}`)
  }

  const data = (await res.json()) as GovInfoSearchResponse
  if (data.error) {
    throw new Error(data.error.message ?? 'GovInfo error')
  }

  return (data.results ?? [])
    .filter((r): r is Required<Pick<GovInfoSearchResult, 'title' | 'packageId'>> & GovInfoSearchResult =>
      Boolean(r.title && r.packageId),
    )
    .map((r) => ({
      title: r.title,
      date: r.dateIssued ?? 'date unknown',
      collection: r.collectionCode ?? 'unknown',
      packageId: r.packageId,
      link: `https://www.govinfo.gov/app/details/${r.packageId}`,
      confidence: 'confirmed' as const,
    }))
}

interface RegulationsComment {
  id: string
  attributes: {
    title?: string
    agencyId?: string
    postedDate?: string
  }
}

interface RegulationsSearchResponse {
  data?: RegulationsComment[]
  errors?: unknown
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The search/list endpoint doesn't return structured firstName/lastName
// (only the single-comment detail endpoint does), and title formats vary by
// era/agency. Requiring the two names to appear as a CONTIGUOUS phrase
// ("First Last" or "Last, First"), not just independently anywhere in the
// title, fixes the two worst false-positive classes found in testing:
// reversed names ("Gregory Farrell" matching a search for "Farrell Gregory")
// and multi-signer comments where two different people's names sit next to
// each other. It does not fix true common-name coincidences (an unrelated
// person who happens to share the full name) — regulations.gov has no
// reliable affiliation field to filter on, unlike GovInfo's org-name trick.
// So these are surfaced as lower-confidence and labeled as such in the UI.
async function searchRegulationsComments(name: string, apiKey: string): Promise<FellowCitation[]> {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]
  const last = parts[parts.length - 1]
  if (!first || !last || first.toLowerCase() === last.toLowerCase()) return []

  const f = escapeRegExp(first)
  const l = escapeRegExp(last)
  const adjacentRe = new RegExp(`\\b(${f}\\s+${l}|${l}\\s*,\\s*${f})\\b`, 'i')

  const url = `https://api.regulations.gov/v4/comments?${new URLSearchParams({
    'filter[searchTerm]': name,
    'page[size]': '20',
    api_key: apiKey,
  })}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`regulations.gov search failed: ${res.status}`)
  }

  const data = (await res.json()) as RegulationsSearchResponse
  return (data.data ?? [])
    .filter((c) => adjacentRe.test(c.attributes.title ?? ''))
    .slice(0, 3)
    .map((c) => ({
      title: c.attributes.title ?? `Comment from ${name}`,
      date: c.attributes.postedDate ?? 'date unknown',
      collection: `${c.attributes.agencyId ?? 'AGENCY'} public comment`,
      packageId: c.id,
      link: `https://www.regulations.gov/comment/${c.id}`,
      confidence: 'possible' as const,
    }))
}

export async function searchFellowCitations(name: string, apiKey: string): Promise<FellowCitation[]> {
  const [govInfo, regulations] = await Promise.all([
    searchGovInfo(name, apiKey).catch((err) => {
      console.error('GovInfo search failed', err)
      return [] as FellowCitation[]
    }),
    searchRegulationsComments(name, apiKey).catch((err) => {
      console.error('regulations.gov search failed', err)
      return [] as FellowCitation[]
    }),
  ])
  // Confirmed (org-name-matched) hits first, possible ones after.
  return [...govInfo, ...regulations]
}
