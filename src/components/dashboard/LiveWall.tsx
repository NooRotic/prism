import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { compactCount, formatCompactDuration } from '../../lib/dashboardStats'
import type { EnrichedFollow } from '../../lib/followsStore'

type WallView = 'wall' | 'list'

interface LiveWallProps {
  /** Live follows, newest live first. */
  live: EnrichedFollow[]
  /** Loaded follows who are not live. */
  offlineCount: number
  /** True while more follows are still to be loaded, which makes `offlineCount` a floor. */
  more: boolean
  now: number
  /** How many tiles to show before the "+ N more live" button. */
  cap: number
  onOpenFollowing: () => void
}

function readView(): WallView {
  try {
    return localStorage.getItem(STORAGE_KEYS.LOCAL_DASHBOARD_WALL_VIEW) === 'list' ? 'list' : 'wall'
  } catch {
    return 'wall'
  }
}

function storeView(view: WallView) {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_DASHBOARD_WALL_VIEW, view)
  } catch {
    // Remembering the tab is a convenience; the wall works without it.
  }
}

function uptimeText(follow: EnrichedFollow, now: number): string {
  const started = follow.startedAt ? Date.parse(follow.startedAt) : NaN
  return Number.isNaN(started) ? '–' : formatCompactDuration(now - started)
}

function thumbnailSrc(follow: EnrichedFollow): string | null {
  return follow.thumbnailUrl
    ? follow.thumbnailUrl.replace('{width}', '320').replace('{height}', '180')
    : null
}

function accessibleName(follow: EnrichedFollow, now: number): string {
  const category = follow.gameName || 'no category'
  return `${follow.broadcaster_name}, ${category}, ${compactCount(follow.viewerCount ?? 0)} viewers, live ${uptimeText(follow, now)}`
}

function Tile({ follow, now }: { follow: EnrichedFollow; now: number }) {
  const src = thumbnailSrc(follow)
  return (
    <Link
      to={`/twitch/${follow.broadcaster_login}`}
      aria-label={accessibleName(follow, now)}
      className="flex flex-col overflow-hidden rounded-md transition-colors hover:bg-white/5"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="relative aspect-video w-full" style={{ backgroundColor: 'var(--bg-card-hover)' }}>
        {src && <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <span
          className="absolute left-1 top-1 rounded px-1 text-[9px] font-bold"
          style={{ backgroundColor: 'var(--accent-red)', color: '#fff' }}
        >
          LIVE
        </span>
        <span
          className="absolute bottom-1 right-1 rounded px-1 text-[10px]"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff' }}
        >
          {compactCount(follow.viewerCount ?? 0)}
        </span>
      </div>
      <div className="flex flex-col px-2 py-1.5">
        <b className="truncate text-xs" style={{ color: 'var(--text-primary)' }}>
          {follow.broadcaster_name}
        </b>
        <span className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {follow.gameName || 'No category'} · {uptimeText(follow, now)}
        </span>
      </div>
    </Link>
  )
}

function Row({ follow, now }: { follow: EnrichedFollow; now: number }) {
  return (
    <Link
      to={`/twitch/${follow.broadcaster_login}`}
      aria-label={accessibleName(follow, now)}
      className="grid grid-cols-[1fr_auto] items-center gap-x-3 rounded px-2 py-1.5 text-xs transition-colors hover:bg-white/5 sm:grid-cols-[1.2fr_1fr_auto_auto]"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <b className="truncate" style={{ color: 'var(--text-primary)' }}>
        {follow.broadcaster_name}
      </b>
      <span className="hidden truncate sm:block" style={{ color: 'var(--text-secondary)' }}>
        {follow.gameName || 'No category'}
      </span>
      <span style={{ color: 'var(--text-primary)' }}>{compactCount(follow.viewerCount ?? 0)}</span>
      <span className="hidden sm:block" style={{ color: 'var(--accent-green)' }}>
        {uptimeText(follow, now)}
      </span>
    </Link>
  )
}

const TAB_BASE = 'rounded-full px-3 py-0.5 text-[11px] transition-colors'

/** The viewer's live follows as a wall of thumbnails or a list, newest first, ending in the offline count. */
export default function LiveWall({ live, offlineCount, more, now, cap, onOpenFollowing }: LiveWallProps) {
  const [view, setView] = useState<WallView>(readView)
  const [expanded, setExpanded] = useState(false)

  const choose = (next: WallView) => {
    setView(next)
    storeView(next)
  }

  const shown = expanded ? live : live.slice(0, cap)
  const hidden = live.length - cap
  const offlineLabel = `${offlineCount}${more ? '+' : ''}`

  return (
    <section aria-label="Live follows" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Live follows · newest first
        </h3>
        <div role="tablist" aria-label="Live follows view" className="flex gap-1">
          {(['wall', 'list'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={view === tab}
              onClick={() => choose(tab)}
              className={TAB_BASE}
              style={{
                color: view === tab ? 'var(--accent-green)' : 'var(--text-secondary)',
                border: `1px solid ${view === tab ? 'var(--accent-green)' : 'var(--border)'}`,
              }}
            >
              {tab === 'wall' ? 'Wall' : 'List'}
            </button>
          ))}
        </div>
      </div>

      {view === 'wall' ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((f) => (
            <Tile key={f.broadcaster_id} follow={f} now={now} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {shown.map((f) => (
            <Row key={f.broadcaster_id} follow={f} now={now} />
          ))}
        </div>
      )}

      <div
        className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs"
        style={{ border: '1px dashed var(--border-accent)', color: 'var(--text-secondary)' }}
      >
        {!expanded && hidden > 0 ? (
          <button type="button" onClick={() => setExpanded(true)} className="text-left">
            + {hidden} more live
          </button>
        ) : expanded && hidden > 0 ? (
          <button type="button" onClick={() => setExpanded(false)} className="text-left">
            Show fewer
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onOpenFollowing}
          aria-label={`${offlineLabel} offline, open Following`}
          className="text-right"
        >
          {offlineLabel} offline ▸
        </button>
      </div>
    </section>
  )
}
