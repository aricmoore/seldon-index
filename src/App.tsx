import { useEffect, useState, useCallback, useRef, FormEvent } from 'react'
import type { EventCategory, IndexEvent, IndexState, PillarCategory } from '../worker/types'
import type { FellowCitation } from '../worker/fellowWatch'
import Sparkline from './Sparkline'

const FELLOW_SUGGESTIONS: Array<{ name: string; title: string }> = [
  { name: 'Samuel Hammond', title: 'Director of AI & Chief Economist' },
  { name: 'Zach Graves', title: 'President & CEO' },
  { name: 'Dan Lips', title: 'Senior Fellow' },
  { name: 'Luke Hogg', title: 'Senior Fellow' },
  { name: 'Soren Dayton', title: 'Director of American Governance' },
  { name: 'Daniel King', title: 'Research Fellow' },
]

const POLL_INTERVAL_MS = 5000
const TWEEN_MS = 700
const FLASH_MS = 900
const CIRCUIT_BREAKER_THRESHOLD = 32
const CIRCUIT_BREAKER_MS = 2200
// Must match BASE_SUB_INDEX in worker/seed.ts: used to seed the replay below.
const BASE_SUB_INDEX = 1000
const PILLARS: PillarCategory[] = ['AI', 'Energy', 'Defense', 'Space']

function buildSubSeries(events: IndexEvent[], pillar: PillarCategory): number[] {
  let running = BASE_SUB_INDEX
  const values = [running]
  for (const e of events) {
    if (e.source === 'rejected') continue
    if (e.category === pillar) running += e.delta
    values.push(running)
  }
  return values
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function DeltaTag({ delta }: { delta: number }) {
  const up = delta >= 0
  return (
    <span className={`delta-tag ${up ? 'delta-up' : 'delta-down'}`}>
      {up ? '▲' : '▼'} {up ? '+' : ''}
      {delta}
    </span>
  )
}

function CategoryTag({ category }: { category?: EventCategory }) {
  if (!category) return null
  return <span className={`category-tag category-${category.toLowerCase()}`}>{category}</span>
}

function useTweenedIndex(target: number | null) {
  const [display, setDisplay] = useState<number | null>(target)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prevTarget = useRef<number | null>(target)

  useEffect(() => {
    if (target === null) return
    const from = prevTarget.current
    if (from === null || from === target) {
      setDisplay(target)
      prevTarget.current = target
      return
    }

    setFlash(target > from ? 'up' : 'down')
    const flashTimeout = setTimeout(() => setFlash(null), FLASH_MS)

    const start = performance.now()
    let raf = 0
    function step(now: number) {
      const t = Math.min(1, (now - start) / TWEEN_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from! + (target! - from!) * eased)
      if (t < 1) {
        raf = requestAnimationFrame(step)
      } else {
        setDisplay(target)
        prevTarget.current = target
      }
    }
    raf = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(flashTimeout)
    }
  }, [target])

  return { display, flash }
}

export default function App() {
  const [state, setState] = useState<IndexState | null>(null)
  const [headline, setHeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [breaker, setBreaker] = useState<'up' | 'down' | null>(null)
  const [fellowQuery, setFellowQuery] = useState('')
  const [fellowResults, setFellowResults] = useState<FellowCitation[] | null>(null)
  const [fellowSearching, setFellowSearching] = useState(false)
  const [fellowError, setFellowError] = useState<string | null>(null)
  const seenIds = useRef<Set<string>>(new Set())
  const hasLoadedOnce = useRef(false)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/state')
    if (res.ok) setState(await res.json())
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const { display, flash } = useTweenedIndex(state?.index ?? null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = headline.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/headline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ headline: trimmed }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'submission failed')
      }
      setHeadline('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFellowSearch(e: FormEvent) {
    e.preventDefault()
    const trimmed = fellowQuery.trim()
    if (!trimmed || fellowSearching) return

    setFellowSearching(true)
    setFellowError(null)
    setFellowResults(null)
    try {
      const res = await fetch(`/api/fellow-watch?name=${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'search failed')
      }
      const body = (await res.json()) as { citations: FellowCitation[] }
      setFellowResults(body.citations)
    } catch (err) {
      setFellowError(err instanceof Error ? err.message : 'search failed')
    } finally {
      setFellowSearching(false)
    }
  }

  const events: IndexEvent[] = state?.events ?? []
  const recentTape = [...events].reverse().slice(0, 25)
  const sparklineValues = events.filter((e) => e.source !== 'rejected').map((e) => e.index)

  if (!hasLoadedOnce.current && state) {
    // Mark the initial batch as already-seen so it renders in place instead
    // of all fading in at once (which looked like an empty tape mid-animation).
    for (const e of events) seenIds.current.add(e.id)
    hasLoadedOnce.current = true
  }
  const newIds = recentTape.filter((e) => !seenIds.current.has(e.id)).map((e) => e.id)

  useEffect(() => {
    for (const e of recentTape) seenIds.current.add(e.id)
  }, [recentTape])

  useEffect(() => {
    const trigger = recentTape.find(
      (e) => newIds.includes(e.id) && e.source === 'live' && Math.abs(e.delta) >= CIRCUIT_BREAKER_THRESHOLD,
    )
    if (!trigger) return
    setBreaker(trigger.delta > 0 ? 'up' : 'down')
    const t = setTimeout(() => setBreaker(null), CIRCUIT_BREAKER_MS)
    return () => clearTimeout(t)
  }, [recentTape, newIds])

  return (
    <div className="page">
      {breaker && (
        <div className={`circuit-breaker circuit-breaker-${breaker}`}>
          ⚠ TRADING HALTED: VOLATILITY DETECTED ⚠
        </div>
      )}
      <header className="masthead">
        <div className="masthead-eyebrow">
          <span className="live-dot" aria-hidden="true" />
          AI · ENERGY · DEFENSE · SPACE
        </div>
        <h1>The Seldon Index</h1>
      </header>

      <section className="hero">
        {display !== null ? (
          <div className={`hero-index ${flash ? `flash-${flash}` : ''}`}>{Math.round(display).toLocaleString()}</div>
        ) : (
          <div className="hero-index is-loading" aria-label="Loading index" />
        )}
        <Sparkline values={sparklineValues} />
      </section>

      <section className="sub-indices">
        {PILLARS.map((pillar) => {
          const series = buildSubSeries(events, pillar)
          const latest = series[series.length - 1]
          return (
            <div key={pillar} className={`sub-index-tile category-${pillar.toLowerCase()}`}>
              <div className="sub-index-label">{pillar}</div>
              <div className="sub-index-value">{state ? Math.round(latest).toLocaleString() : '-'}</div>
              <Sparkline values={series} width={200} height={56} />
            </div>
          )
        })}
      </section>

      <section className="wire-form-section">
        <form className="wire-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="File a wire headline…"
            value={headline}
            maxLength={140}
            onChange={(e) => setHeadline(e.target.value)}
            disabled={submitting}
          />
          <button type="submit" disabled={submitting || !headline.trim()}>
            {submitting ? 'Filing…' : 'File'}
          </button>
        </form>
        {error && <div className="wire-form-error">{error}</div>}
      </section>

      <section className="tape">
        <table>
          <tbody>
            {recentTape.map((e) => {
              const rejected = e.source === 'rejected'
              const isEasterEgg = e.source === 'easter-egg'
              return (
                <tr
                  key={e.id}
                  className={[
                    newIds.includes(e.id) ? 'tape-row-new' : '',
                    rejected ? 'tape-row-rejected' : '',
                    isEasterEgg ? 'tape-row-easter-egg' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td className="tape-time">{formatTime(e.at)}</td>
                  <td className="tape-headline">
                    {e.headline}
                    {(e.category || e.rationale) && (
                      <div className="tape-rationale">
                        <CategoryTag category={e.category} />
                        {rejected ? 'REJECTED: ' : ''}
                        {e.rationale}
                      </div>
                    )}
                  </td>
                  <td className="tape-delta">
                    {isEasterEgg ? (
                      <span className="delta-tag delta-easter-egg">*</span>
                    ) : rejected ? (
                      <span className="delta-tag delta-rejected">0</span>
                    ) : (
                      <DeltaTag delta={e.delta} />
                    )}
                  </td>
                  <td className="tape-index">{Math.round(e.index).toLocaleString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="fellow-watch">
        <h2 className="fellow-watch-title">Fellow Watch</h2>
        <p className="fellow-watch-sub">
          Search the federal record (hearings, Congressional Record, committee reports, and public agency comments)
          for a name. Real citations only: no hit means no claim, and every result is labeled by how confident the
          match is.
        </p>
        <form className="wire-form" onSubmit={handleFellowSearch}>
          <input
            type="text"
            placeholder="Search a name..."
            value={fellowQuery}
            maxLength={80}
            onChange={(e) => setFellowQuery(e.target.value)}
            disabled={fellowSearching}
          />
          <button type="submit" disabled={fellowSearching || !fellowQuery.trim()}>
            {fellowSearching ? 'Searching...' : 'Search'}
          </button>
        </form>
        <div className="fellow-watch-suggestions">
          Try:{' '}
          {FELLOW_SUGGESTIONS.map((f, i) => (
            <span key={f.name}>
              <button type="button" className="fellow-suggestion" onClick={() => setFellowQuery(f.name)}>
                {f.name} ({f.title})
              </button>
              {i < FELLOW_SUGGESTIONS.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
        {fellowError && <div className="wire-form-error">{fellowError}</div>}
        {fellowSearching && <div className="fellow-watch-status">Searching the federal record...</div>}
        {fellowResults && !fellowSearching && (
          fellowResults.length > 0 ? (
            <ul className="fellow-watch-results">
              {fellowResults.map((c) => (
                <li key={c.packageId} className={`fellow-watch-card confidence-${c.confidence}`}>
                  <div className="fellow-watch-card-head">
                    <a href={c.link} target="_blank" rel="noreferrer" className="fellow-watch-card-title">
                      {c.title}
                    </a>
                    <span className={`confidence-badge confidence-badge-${c.confidence}`}>
                      {c.confidence === 'confirmed' ? 'confirmed' : 'possible match'}
                    </span>
                  </div>
                  <div className="fellow-watch-card-meta">
                    {c.collection}, {c.date}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="fellow-watch-status">No citations found in the federal record.</div>
          )
        )}
      </section>
    </div>
  )
}
