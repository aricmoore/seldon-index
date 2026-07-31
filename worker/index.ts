import type { IndexEvent, IndexState } from './types'
import { scoreHeadline } from './scorer'
import { buildSeedState } from './seed'

const STATE_KEY = 'state'
const MAX_EVENTS = 200
const MAX_HEADLINE_LENGTH = 140

async function loadState(env: Env): Promise<IndexState> {
  const raw = await env.AII_KV.get(STATE_KEY)
  if (raw) return JSON.parse(raw) as IndexState

  const seeded = buildSeedState(Date.now())
  await env.AII_KV.put(STATE_KEY, JSON.stringify(seeded))
  return seeded
}

async function saveState(env: Env, state: IndexState): Promise<void> {
  const trimmed: IndexState = {
    index: state.index,
    events: state.events.slice(-MAX_EVENTS),
  }
  await env.AII_KV.put(STATE_KEY, JSON.stringify(trimmed))
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function handleGetState(env: Env): Promise<Response> {
  const state = await loadState(env)
  return json(state)
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

  const state = await loadState(env)
  const { delta } = scoreHeadline(headline)
  const newIndex = state.index + delta
  const event: IndexEvent = {
    id: crypto.randomUUID(),
    headline: headline.trim(),
    delta,
    index: newIndex,
    source: 'live',
    at: new Date().toISOString(),
  }

  const nextState: IndexState = {
    index: newIndex,
    events: [...state.events, event],
  }
  await saveState(env, nextState)

  return json({ event, index: newIndex })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    try {
      if (url.pathname === '/api/state' && request.method === 'GET') {
        return await handleGetState(env)
      }
      if (url.pathname === '/api/headline' && request.method === 'POST') {
        return await handlePostHeadline(request, env)
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
