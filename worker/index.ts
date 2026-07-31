import type { IndexEvent, IndexState } from './types'
import { scoreHeadline, looksLikePlausibleHeadline } from './scorer'
import { buildSeedState } from './seed'
import { classifyHeadline, type ClassificationResult } from './classifier'
import { searchFellowCitations, type FellowCitation } from './fellowWatch'
import { fetchExternalSignals, type ExternalSignals } from './externalSignals'
import { FELLOW_ROSTER, type FellowMentions } from './fellows'

const SIGNALS_CACHE_KEY = 'external-signals-cache'
const SIGNALS_CACHE_TTL_MS = 12 * 60_000
const MENTIONS_CACHE_KEY = 'fellow-mentions-cache'
// Federal-record mentions don't shift on a demo's timescale, so this outlives SIGNALS_CACHE_TTL_MS.
const MENTIONS_CACHE_TTL_MS = 30 * 60_000

const STATE_KEY = 'state'
const MAX_EVENTS = 200
const MAX_HEADLINE_LENGTH = 140
const MAX_SUBMITTER_LENGTH = 40
const MAX_FELLOW_NAME_LENGTH = 80
const IMPACT_SCALE = 4
const MAX_ABS_DELTA = 40

function scaledDelta(impact: number): number {
  return Math.max(-MAX_ABS_DELTA, Math.min(MAX_ABS_DELTA, Math.round(impact * IMPACT_SCALE)))
}

async function classifyWithFallback(headline: string, env: Env): Promise<ClassificationResult> {
  try {
    return await classifyHeadline(headline, env.ANTHROPIC_API_KEY)
  } catch (err) {
    console.error('classifier failed, falling back to keyword scorer', err)
    const { delta, category } = scoreHeadline(headline)
    const plausible = looksLikePlausibleHeadline(headline)
    return {
      valid: plausible,
      category,
      impact: plausible ? Math.round(delta / IMPACT_SCALE) : 0,
      rationale: plausible
        ? 'keyword fallback (classifier unavailable)'
        : 'too short to evaluate (classifier unavailable)',
    }
  }
}

async function loadState(env: Env): Promise<IndexState> {
  const raw = await env.AII_KV.get(STATE_KEY)
  if (raw) return JSON.parse(raw) as IndexState

  const seeded = buildSeedState(Date.now())
  await env.AII_KV.put(STATE_KEY, JSON.stringify(seeded))
  return seeded
}

function trimState(state: IndexState): IndexState {
  return {
    index: state.index,
    subIndices: state.subIndices,
    events: state.events.slice(-MAX_EVENTS),
  }
}

const WRITE_RETRY_ATTEMPTS = 5

// Cloudflare KV has no compare-and-swap, so a plain read -> compute -> write
// cycle can silently drop concurrent submissions (confirmed in testing: 5
// simultaneous requests, only 1 survived). This narrows that window rather
// than eliminating it: re-read the raw KV value immediately before writing,
// and if it's changed since the mutation was computed, recompute against
// the fresh state and retry. A tiny race still exists between the final
// read and the write itself (KV has no atomic primitive for that), but this
// shrinks the exposure from "the full classifier call" down to two reads
// and a comparison. A Durable Object would close it fully but is out of
// scope for today.
async function mutateState(env: Env, mutate: (state: IndexState) => IndexState): Promise<IndexState> {
  for (let attempt = 0; attempt < WRITE_RETRY_ATTEMPTS; attempt++) {
    const before = await env.AII_KV.get(STATE_KEY)
    const state = before ? (JSON.parse(before) as IndexState) : buildSeedState(Date.now())
    const next = trimState(mutate(state))

    const check = await env.AII_KV.get(STATE_KEY)
    if (check !== before) continue // someone else wrote in between; retry against fresh state

    await env.AII_KV.put(STATE_KEY, JSON.stringify(next))
    return next
  }
  // Give up narrowing the race and just apply on top of whatever's latest,
  // rather than failing the request outright after repeated contention.
  const state = await loadState(env)
  const next = trimState(mutate(state))
  await env.AII_KV.put(STATE_KEY, JSON.stringify(next))
  return next
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Both routes below call metered, rate-limited external APIs (the headline
// classifier, GovInfo, regulations.gov) on every request with no auth in
// front of them, so an unthrottled client can drive real API cost/quota usage.
// Keyed per IP per route.
async function rateLimited(limiter: RateLimit, request: Request, routeKey: string): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const { success } = await limiter.limit({ key: `${routeKey}:${ip}` })
  return !success
}

async function handleGetState(env: Env): Promise<Response> {
  const state = await loadState(env)
  return json(state)
}

async function handleFellowWatch(url: URL, env: Env): Promise<Response> {
  const name = url.searchParams.get('name')?.trim()
  if (!name) return json({ error: 'name query param is required' }, 400)
  if (name.length > MAX_FELLOW_NAME_LENGTH) {
    return json({ error: `name must be ${MAX_FELLOW_NAME_LENGTH} characters or fewer` }, 400)
  }

  try {
    const citations = await searchFellowCitations(name, env.GOVINFO_API_KEY)
    return json({ name, citations })
  } catch (err) {
    console.error('fellow watch search failed', err)
    return json({ error: 'search failed' }, 502)
  }
}

async function buildFellowMentions(env: Env): Promise<FellowMentions> {
  const fellows = await Promise.all(
    FELLOW_ROSTER.map(async (fellow) => {
      const citations = await searchFellowCitations(fellow.name, env.GOVINFO_API_KEY).catch((err) => {
        console.error(`fellow mentions lookup failed for ${fellow.name}`, err)
        return [] as FellowCitation[]
      })
      const confirmed = citations.filter((c) => c.confidence === 'confirmed').length
      const possible = citations.filter((c) => c.confidence === 'possible').length
      return { name: fellow.name, title: fellow.title, confirmed, possible, total: confirmed + possible }
    }),
  )

  return {
    generatedAt: new Date().toISOString(),
    stale: false,
    fellows: fellows.filter((f) => f.total > 0).sort((a, b) => b.total - a.total || b.confirmed - a.confirmed),
  }
}

async function handleFellowMentions(env: Env): Promise<Response> {
  const cachedRaw = await env.AII_KV.get(MENTIONS_CACHE_KEY)
  const cached = cachedRaw ? (JSON.parse(cachedRaw) as FellowMentions) : null
  const cacheAge = cached ? Date.now() - new Date(cached.generatedAt).getTime() : Infinity

  if (cached && cacheAge < MENTIONS_CACHE_TTL_MS) {
    return json(cached)
  }

  try {
    const fresh = await buildFellowMentions(env)
    await env.AII_KV.put(MENTIONS_CACHE_KEY, JSON.stringify(fresh))
    return json(fresh)
  } catch (err) {
    console.error('fellow mentions build failed', err)
    if (cached) return json({ ...cached, stale: true })
    return json({ generatedAt: new Date().toISOString(), stale: false, fellows: [] })
  }
}

async function handleExternalSignals(env: Env): Promise<Response> {
  const cachedRaw = await env.AII_KV.get(SIGNALS_CACHE_KEY)
  const cached = cachedRaw ? (JSON.parse(cachedRaw) as ExternalSignals) : null
  const cacheAge = cached ? Date.now() - new Date(cached.generatedAt).getTime() : Infinity

  if (cached && cacheAge < SIGNALS_CACHE_TTL_MS) {
    return json(cached)
  }

  const fresh = await fetchExternalSignals()
  if (fresh) {
    await env.AII_KV.put(SIGNALS_CACHE_KEY, JSON.stringify(fresh))
    return json(fresh)
  }

  if (cached) {
    return json({ ...cached, stale: true })
  }

  return json({ generatedAt: new Date().toISOString(), stale: false, status: 'degraded', signals: [] })
}

async function handlePostHeadline(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const headline = (body as { headline?: unknown })?.headline
  if (typeof headline !== 'string' || headline.trim().length === 0) {
    return json({ error: 'headline is required' }, 400)
  }
  if (headline.length > MAX_HEADLINE_LENGTH) {
    return json({ error: `headline must be ${MAX_HEADLINE_LENGTH} characters or fewer` }, 400)
  }

  const submittedByRaw = (body as { submittedBy?: unknown })?.submittedBy
  if (typeof submittedByRaw === 'string' && submittedByRaw.length > MAX_SUBMITTER_LENGTH) {
    return json({ error: `submittedBy must be ${MAX_SUBMITTER_LENGTH} characters or fewer` }, 400)
  }
  const submittedBy =
    typeof submittedByRaw === 'string' && submittedByRaw.trim().length > 0 ? submittedByRaw.trim() : undefined

  const classification = await classifyWithFallback(headline.trim(), env)
  let event!: IndexEvent

  const nextState = await mutateState(env, (state) => {
    const delta = classification.valid ? scaledDelta(classification.impact) : 0
    const newIndex = state.index + delta
    event = {
      id: crypto.randomUUID(),
      headline: headline.trim(),
      delta,
      index: classification.valid ? newIndex : state.index,
      source: classification.valid ? 'live' : 'rejected',
      category: classification.category,
      rationale: classification.rationale,
      submittedBy,
      at: new Date().toISOString(),
    }

    const nextSubIndices = { ...state.subIndices }
    if (classification.valid && classification.category !== 'Other') {
      nextSubIndices[classification.category] += delta
    }

    return {
      index: classification.valid ? newIndex : state.index,
      subIndices: nextSubIndices,
      events: [...state.events, event],
    }
  })

  return json({ event, index: nextState.index })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    try {
      if (url.pathname === '/api/state' && request.method === 'GET') {
        return await handleGetState(env)
      }
      if (url.pathname === '/api/headline' && request.method === 'POST') {
        if (await rateLimited(env.HEADLINE_RATE_LIMITER, request, 'headline')) {
          return json({ error: 'rate limit exceeded, try again shortly' }, 429)
        }
        return await handlePostHeadline(request, env)
      }
      if (url.pathname === '/api/fellow-watch' && request.method === 'GET') {
        if (await rateLimited(env.FELLOW_WATCH_RATE_LIMITER, request, 'fellow-watch')) {
          return json({ error: 'rate limit exceeded, try again shortly' }, 429)
        }
        return await handleFellowWatch(url, env)
      }
      if (url.pathname === '/api/external-signals' && request.method === 'GET') {
        return await handleExternalSignals(env)
      }
      if (url.pathname === '/api/fellow-mentions' && request.method === 'GET') {
        return await handleFellowMentions(env)
      }
      if (url.pathname.startsWith('/api/')) {
        return json({ error: 'not found' }, 404)
      }
    } catch (err) {
      console.error('worker error', err)
      return json({ error: 'internal error' }, 500)
    }

    return env.ASSETS.fetch(request)
  },
}
