import { useEffect, useMemo, useState } from 'react'
import CatchupCard from '../components/youtube/CatchupCard'
import { useCatchup } from '../hooks/useCatchup'
import { LANE_LABEL, type Lane } from '../lib/catchup'
import { isGoogleAuthConfigured } from '../lib/googleYoutubeAuth'
import { writeQueueSnapshot } from '../lib/videoContext'

type Filter = 'All' | Lane
const FILTERS: Filter[] = ['All', 'S', 'W', 'R']

const buttonStyle = (active = false) => ({
  backgroundColor: active ? 'var(--accent-youtube)' : 'var(--bg-card)',
  color: active ? '#fff' : 'var(--text-primary)',
  border: '1px solid var(--border)',
})

/** Catch up: new subscription uploads, Watch Later and related videos in one queue (2 : 1 : 1). */
export default function YoutubeCatchupPage() {
  const catchup = useCatchup()
  const [filter, setFilter] = useState<Filter>('All')
  const [pasted, setPasted] = useState('')
  const configured = isGoogleAuthConfigured()
  const shown = useMemo(
    () => (filter === 'All' ? catchup.queue : catchup.queue.filter((v) => v.tag === filter)),
    [filter, catchup.queue],
  )
  // The player page's filmstrip reads this: the queue as it is shown here, in this order.
  useEffect(() => {
    // An empty list (still loading, or an empty lane) never replaces a good snapshot.
    if (shown.length > 0) writeQueueSnapshot(shown)
  }, [shown])

  return (
    <div className="flex flex-col gap-4 w-full max-w-6xl mx-auto px-4 md:px-6 pt-4 pb-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold font-heading uppercase tracking-wider" style={{ color: 'var(--accent-youtube)' }}>
          Import from YT
        </h2>
        <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
          {catchup.subscriptionCount} subscriptions, {catchup.watchLaterCount} Watch Later videos
        </p>
        {catchup.account && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {`Subscriptions ${catchup.account.title ? `from ${catchup.account.title}, ` : ''}imported ${new Date(catchup.account.importedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded px-3 py-1.5 text-sm"
          style={buttonStyle()}
          disabled={!configured || catchup.importing}
          onClick={() => void catchup.importSubscriptions()}
        >
          {catchup.importing ? 'Importing…' : 'Import my subscriptions'}
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-sm"
          style={buttonStyle()}
          disabled={catchup.status === 'loading'}
          onClick={() => void catchup.refresh({ force: true })}
        >
          Refresh
        </button>
        {!configured && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {import.meta.env.DEV
              ? 'Set VITE_YOUTUBE_CLIENT_ID in .env to turn this on.'
              : 'Subscription import is not available on this site.'}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg p-3" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <a
          href="https://www.youtube.com/playlist?list=WL"
          target="_blank"
          rel="noreferrer"
          className="text-sm underline"
          style={{ color: 'var(--text-primary)' }}
        >
          Open Watch Later on YouTube
        </a>
        <label htmlFor="catchup-watch-later" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Paste your Watch Later videos (links or ids, one per line). PRISM cannot read that list itself.
        </label>
        <textarea
          id="catchup-watch-later"
          rows={3}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          className="rounded p-2 text-sm font-mono"
          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm"
            style={buttonStyle()}
            onClick={() => void catchup.savePastedWatchLater(pasted)}
          >
            Save pasted videos
          </button>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm"
            style={buttonStyle()}
            onClick={() => void catchup.clearWatchLater()}
          >
            Clear Watch Later
          </button>
        </div>
      </div>

      {catchup.notices.length > 0 && (
        <ul className="text-sm flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
          {catchup.notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            title={f === 'All' ? 'Every lane' : LANE_LABEL[f]}
            aria-pressed={filter === f}
            className="rounded px-3 py-1 text-xs font-mono"
            style={buttonStyle(filter === f)}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {catchup.status === 'loading' && catchup.queue.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Loading…
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Nothing to show yet. Import your subscriptions, paste some Watch Later videos, or watch a few videos in PRISM.
        </p>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((v) => (
            <CatchupCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  )
}
