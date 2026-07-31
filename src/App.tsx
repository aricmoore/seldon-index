import { useEffect, useState, useCallback, FormEvent } from 'react'
import type { IndexEvent, IndexState } from '../worker/types'
import Sparkline from './Sparkline'

const POLL_INTERVAL_MS = 5000

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

export default function App() {
  const [state, setState] = useState<IndexState | null>(null)
  const [headline, setHeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/state')
    if (res.ok) setState(await res.json())
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

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

  const events: IndexEvent[] = state?.events ?? []
  const recentTape = [...events].reverse().slice(0, 25)
  const sparklineValues = events.map((e) => e.index)

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-eyebrow">AI · ENERGY · DEFENSE · SPACE</div>
        <h1>The American Innovation Index</h1>
      </header>

      <section className="hero">
        <div className="hero-index">{state ? Math.round(state.index).toLocaleString() : '...'}</div>
        <Sparkline values={sparklineValues} />
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
            {recentTape.map((e) => (
              <tr key={e.id}>
                <td className="tape-time">{formatTime(e.at)}</td>
                <td className="tape-headline">{e.headline}</td>
                <td className="tape-delta">
                  <DeltaTag delta={e.delta} />
                </td>
                <td className="tape-index">{Math.round(e.index).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
