import { CirclePlay, Radio } from 'lucide-react'
import RailEntryCard from './RailEntryCard'
import type { RailEntry } from './types'
import type { useYoutubeLive } from '../../hooks/useYoutubeLive'
import { CHECKS_PER_DAY } from '../../lib/youtubeLiveBudget'

export type YoutubeRailState = Pick<
  ReturnType<typeof useYoutubeLive>,
  'streams' | 'checkedAt' | 'status' | 'allowance' | 'quotaReached' | 'now' | 'check'
>

const minutesUntil = (at: number, now: number) => Math.max(1, Math.ceil((at - now) / 60_000))
const minutesSince = (at: number, now: number) => Math.max(0, Math.floor((now - at) / 60_000))

/** The one line under the button: what the last check found, or why the button is off. */
function statusLine(live: YoutubeRailState): string | null {
  if (live.status === 'checking') return 'Checking your subscriptions…'
  if (live.quotaReached) return "PRISM has used up YouTube's daily limit; try again tomorrow."
  if (live.status === 'error') return 'Could not reach YouTube.'
  if (!live.allowance.ok) {
    return live.allowance.reason === 'daily'
      ? `Limit is ${CHECKS_PER_DAY} checks a day. Next check in ${minutesUntil(live.allowance.retryAt, live.now)} min.`
      : `Next check in ${minutesUntil(live.allowance.retryAt, live.now)} min.`
  }
  return null
}

/**
 * The rail's YouTube group. Unlike a Twitch section it is never empty-and-hidden: the "Check live" button has to be
 * reachable before anything is known. Entries come from the last check, labelled with their age, because a stream
 * seen an hour ago may have ended.
 */
export default function YoutubeRailSection({ live, expanded }: { live: YoutubeRailState; expanded: boolean }) {
  const entries: RailEntry[] = live.streams.map((s) => ({
    id: `youtube:${s.channelId}`,
    displayName: s.channelTitle,
    avatarUrl: s.avatarUrl,
    href: `/youtube/${s.videoId}`,
    isLive: true,
    viewerCount: s.viewerCount,
    streamTitle: s.title,
    gameName: null,
    startedAt: s.startedAt,
    accent: 'youtube',
  }))
  const disabled = live.status === 'checking' || live.quotaReached || !live.allowance.ok
  const line = statusLine(live)

  return (
    <section aria-label="YouTube" className="flex flex-col gap-1">
      <header className="flex items-center gap-2 px-2 py-1">
        <CirclePlay size={16} style={{ color: 'var(--accent-youtube)' }} />
        {expanded && (
          <span
            className="text-xs font-semibold uppercase"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
          >
            YouTube
          </span>
        )}
      </header>

      <button
        type="button"
        onClick={() => void live.check()}
        disabled={disabled}
        aria-label="Check live"
        title="Check which of your subscriptions are live"
        className="mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-white/5 disabled:cursor-default disabled:opacity-50"
        style={{ color: 'var(--text-primary)', border: '1px solid var(--border)', background: 'transparent' }}
      >
        <Radio size={14} style={{ color: 'var(--accent-youtube)', flexShrink: 0 }} />
        {expanded && <span>Check live</span>}
      </button>

      {expanded && (
        <div className="flex flex-col gap-0.5 px-2" style={{ color: 'var(--text-muted)' }}>
          {line && (
            <span role="status" className="text-xs">
              {line}
            </span>
          )}
          {live.checkedAt !== null && live.status !== 'checking' && (
            <span className="text-xs">Checked {minutesSince(live.checkedAt, live.now)} min ago</span>
          )}
          {live.checkedAt !== null && entries.length === 0 && live.status !== 'checking' && (
            <span className="text-xs">Nobody you subscribe to is live.</span>
          )}
        </div>
      )}

      {entries.map((entry) => (
        <RailEntryCard key={entry.id} entry={entry} expanded={expanded} />
      ))}
    </section>
  )
}
