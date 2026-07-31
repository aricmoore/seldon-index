import { useEffect, useState, useCallback, useRef, FormEvent, CSSProperties, ReactNode } from 'react'
import type { EventCategory, IndexEvent, IndexState, PillarCategory } from '../worker/types'
import type { FellowCitation } from '../worker/fellowWatch'
import type { ExternalSignals } from '../worker/externalSignals'
import { PILLAR_CATEGORIES, getCategoryMeta } from '../worker/categories'
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
const SIGNALS_POLL_MS = 60000
const TWEEN_MS = 700
const FLASH_MS = 900
const CIRCUIT_BREAKER_THRESHOLD = 32
const CIRCUIT_BREAKER_MS = 2200
// Must match BASE_SUB_INDEX in worker/seed.ts: used to seed the replay below.
const BASE_SUB_INDEX = 1000
const THEME_STORAGE_KEY = 'seldon-theme'
const SUBMITTER_STORAGE_KEY = 'seldon-submitter'

type Theme = 'dark' | 'light'

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

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
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
  const meta = getCategoryMeta(category)
  return (
    <span className="category-tag" style={meta ? ({ '--tag-color': meta.color } as CSSProperties) : undefined}>
      {meta ? meta.shortLabel : category}
    </span>
  )
}

function Panel({
  title,
  eyebrow,
  className,
  children,
}: {
  title: string
  eyebrow?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <div className="panel-header">
        <h2 className="panel-title">{title}</h2>
        {eyebrow && <span className="panel-eyebrow">{eyebrow}</span>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  )
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

function buildLeaderboard(events: IndexEvent[]): Array<{ name: string; totalAbsDelta: number; count: number }> {
  const map = new Map<string, { name: string; totalAbsDelta: number; count: number }>()
  for (const e of events) {
    if (e.source !== 'live' || !e.submittedBy) continue
    const key = e.submittedBy.trim().toLowerCase()
    if (!key) continue
    const entry = map.get(key) ?? { name: e.submittedBy.trim(), totalAbsDelta: 0, count: 0 }
    entry.totalAbsDelta += Math.abs(e.delta)
    entry.count += 1
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => b.totalAbsDelta - a.totalAbsDelta).slice(0, 8)
}

function findMovers(events: IndexEvent[]): { gain?: IndexEvent; loss?: IndexEvent } {
  let gain: IndexEvent | undefined
  let loss: IndexEvent | undefined
  for (const e of events) {
    if (e.source !== 'live') continue
    if (e.delta > 0 && (!gain || e.delta > gain.delta)) gain = e
    if (e.delta < 0 && (!loss || e.delta < loss.delta)) loss = e
  }
  return { gain, loss }
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [state, setState] = useState<IndexState | null>(null)
  const [signals, setSignals] = useState<ExternalSignals | null>(null)
  const [headline, setHeadline] = useState('')
  const [submittedBy, setSubmittedBy] = useState(() =>
    typeof window === 'undefined' ? '' : window.localStorage.getItem(SUBMITTER_STORAGE_KEY) ?? '',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [breaker, setBreaker] = useState<'up' | 'down' | null>(null)
  const [fellowQuery, setFellowQuery] = useState('')
  const [fellowResults, setFellowResults] = useState<FellowCitation[] | null>(null)
  const [fellowSearching, setFellowSearching] = useState(false)
  const [fellowError, setFellowError] = useState<string | null>(null)
  const seenIds = useRef<Set<string>>(new Set())
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const refresh = useCallback(async () => {
    const res = await fetch('/api/state')
    if (res.ok) setState(await res.json())
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    async function loadSignals() {
      try {
        const res = await fetch('/api/external-signals')
        if (res.ok && !cancelled) setSignals(await res.json())
      } catch {
        // Signals are best-effort; leave the panel showing whatever it last had.
      }
    }
    loadSignals()
    const id = setInterval(loadSignals, SIGNALS_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

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
        body: JSON.stringify({ headline: trimmed, submittedBy: submittedBy.trim() || undefined }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'submission failed')
      }
      setHeadline('')
      if (submittedBy.trim()) window.localStorage.setItem(SUBMITTER_STORAGE_KEY, submittedBy.trim())
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
  const sessionHigh = sparklineValues.length ? Math.max(...sparklineValues) : null
  const sessionLow = sparklineValues.length ? Math.min(...sparklineValues) : null

  const sectorRows = PILLAR_CATEGORIES.map((meta) => {
    const series = buildSubSeries(events, meta.id)
    const latest = series[series.length - 1]
    return { meta, series, latest, netChange: latest - BASE_SUB_INDEX }
  }).sort((a, b) => b.latest - a.latest)

  const movers = findMovers(events)
  const leaderboard = buildLeaderboard(events)

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

      <div className="terminal-grid">
        <header className="masthead grid-area-header">
          <div className="masthead-left">
            <span className="live-dot" aria-hidden="true" />
            <span className="masthead-eyebrow">{PILLAR_CATEGORIES.map((c) => c.shortLabel).join(' · ')}</span>
          </div>
          <div className="masthead-right">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <h1 className="masthead-title">The Seldon Index</h1>
            <img
              src={theme === 'dark' ? '/images/Lockup-White%202.png' : '/images/Lockup-Black.png'}
              alt="Foundation for American Innovation"
              className="masthead-logo"
            />
          </div>
        </header>

        <p className="byline grid-area-byline">We are quantifying civilisational trajectory. Let's win.</p>

        <Panel title="THE INDEX" className="grid-area-hero" eyebrow="LIVE">
          {display !== null ? (
            <div className={`hero-index ${flash ? `flash-${flash}` : ''}`}>{Math.round(display).toLocaleString()}</div>
          ) : (
            <div className="hero-index is-loading" aria-label="Loading index" />
          )}
          <Sparkline values={sparklineValues} />
          {sessionHigh !== null && sessionLow !== null && (
            <div className="session-range">
              SESSION HIGH {Math.round(sessionHigh).toLocaleString()} · LOW {Math.round(sessionLow).toLocaleString()}
            </div>
          )}
        </Panel>

        <Panel title="SECTOR BOARD" className="grid-area-sectors">
          <ol className="sector-board">
            {sectorRows.map((row, i) => (
              <li key={row.meta.id} className="sector-row">
                <span className="sector-rank">{i + 1}</span>
                <span className="sector-dot" style={{ background: row.meta.color } as CSSProperties} />
                <span className="sector-label">{row.meta.shortLabel}</span>
                <span className="sector-value">{state ? Math.round(row.latest).toLocaleString() : '-'}</span>
                <span className={`sector-change ${row.netChange >= 0 ? 'delta-up' : 'delta-down'}`}>
                  {row.netChange >= 0 ? '▲' : '▼'} {Math.abs(Math.round(row.netChange))}
                </span>
                <Sparkline values={row.series} width={72} height={24} color={row.meta.color} />
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="MARKET MOVERS" className="grid-area-movers">
          {movers.gain || movers.loss ? (
            <div className="movers">
              {movers.gain && (
                <div className="mover-row">
                  <span className="mover-label delta-up">TOP GAIN</span>
                  <CategoryTag category={movers.gain.category} />
                  <span className="mover-headline">{movers.gain.headline}</span>
                  <DeltaTag delta={movers.gain.delta} />
                </div>
              )}
              {movers.loss && (
                <div className="mover-row">
                  <span className="mover-label delta-down">TOP LOSS</span>
                  <CategoryTag category={movers.loss.category} />
                  <span className="mover-headline">{movers.loss.headline}</span>
                  <DeltaTag delta={movers.loss.delta} />
                </div>
              )}
            </div>
          ) : (
            <div className="panel-status">No wire submissions yet this session.</div>
          )}
        </Panel>

        <Panel title="FILE A WIRE" className="grid-area-wire">
          <form className="wire-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="File a wire headline…"
              value={headline}
              maxLength={140}
              onChange={(e) => setHeadline(e.target.value)}
              disabled={submitting}
            />
            <input
              type="text"
              placeholder="Filed by (optional)"
              value={submittedBy}
              maxLength={40}
              onChange={(e) => setSubmittedBy(e.target.value)}
              disabled={submitting}
              className="wire-form-name"
            />
            <button type="submit" disabled={submitting || !headline.trim()}>
              {submitting ? 'Filing…' : 'File'}
            </button>
          </form>
          {error && <div className="wire-form-error">{error}</div>}
        </Panel>

        <Panel title="SIGNALS" className="grid-area-signals" eyebrow="EXTERNAL">
          {signals && signals.signals.length > 0 ? (
            <ul className="signals-list">
              {signals.signals.map((s) => {
                const delta = s.count - s.countPrevious
                return (
                  <li key={s.label} className="signal-row">
                    <div className="signal-label">{s.label}</div>
                    <div className="signal-value">
                      {s.count}
                      <span className={`signal-delta ${delta >= 0 ? 'delta-up' : 'delta-down'}`}>
                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs prior 7d
                      </span>
                    </div>
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="signal-source">
                      federalregister.gov
                    </a>
                    {signals.stale && <span className="signal-stale">stale</span>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="panel-status">Live signal feed unavailable.</div>
          )}
        </Panel>

        <Panel title="WIRE TAPE" className="grid-area-tape">
          <table>
            <tbody>
              {recentTape.map((e) => {
                const rejected = e.source === 'rejected'
                return (
                  <tr
                    key={e.id}
                    className={[newIds.includes(e.id) ? 'tape-row-new' : '', rejected ? 'tape-row-rejected' : '']
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
                      {e.submittedBy && <div className="tape-attribution">· filed by {e.submittedBy}</div>}
                    </td>
                    <td className="tape-delta">
                      {rejected ? <span className="delta-tag delta-rejected">0</span> : <DeltaTag delta={e.delta} />}
                    </td>
                    <td className="tape-index">{Math.round(e.index).toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title="TOP CONTRIBUTORS" className="grid-area-leaderboard" eyebrow="LAST 200 WIRES">
          {leaderboard.length > 0 ? (
            <ol className="leaderboard">
              {leaderboard.map((row, i) => (
                <li key={row.name} className="leaderboard-row">
                  <span className="leaderboard-rank">{i + 1}</span>
                  <span className="leaderboard-name">{row.name}</span>
                  <span className="leaderboard-count">{row.count}×</span>
                  <span className="leaderboard-score">{row.totalAbsDelta}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="panel-status">No attributed submissions yet.</div>
          )}
        </Panel>

        <Panel title="FELLOW WATCH" className="grid-area-fellow">
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
        </Panel>
      </div>
    </div>
  )
}
