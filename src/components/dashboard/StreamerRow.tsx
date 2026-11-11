import { compactCount } from '../../lib/dashboardStats'
import { formatHours, formatRank, formatSigned, formatWhole } from '../../lib/streamerFormat'
import type { TrackerSummary } from '../../lib/twitchTracker'

interface StreamerRowProps {
  /** The signed-in channel's follower total from Twitch, or null when it is not available. */
  followers: number | null
  /** The channel's subscriber total from Twitch, or null when it is not available. */
  subscribers: number | null
  /** TwitchTracker's 30-day summary, or null when it has none. */
  tracker: TrackerSummary | null
  trackerLoading: boolean
  /** True when there is no TwitchTracker summary because no answer could be had, not because it does not track the channel. */
  trackerUnavailable: boolean
  login: string
}

interface Chip {
  label: string
  /** The text to show, or null when the figure is not available. */
  value: string | null
  fromTracker: boolean
  large?: boolean
}

const MISSING = '–'
const LOADING = '…'
const TRACKER_TITLE = 'TwitchTracker, last 30 days'

function chips(
  followers: number | null,
  subscribers: number | null,
  tracker: TrackerSummary | null,
): Chip[] {
  const from = <K extends keyof TrackerSummary>(key: K, format: (n: number) => string): string | null => {
    const value = tracker?.[key]
    return value === null || value === undefined ? null : format(value)
  }

  return [
    { label: 'Rank', value: from('rank', formatRank), fromTracker: true, large: true },
    { label: 'Followers', value: followers === null ? null : formatWhole(followers), fromTracker: false },
    { label: 'Subscribers', value: subscribers === null ? null : formatWhole(subscribers), fromTracker: false },
    { label: 'Avg viewers', value: from('avgViewers', formatWhole), fromTracker: true },
    { label: 'Peak viewers', value: from('maxViewers', formatWhole), fromTracker: true },
    { label: 'Hours streamed', value: from('minutesStreamed', (m) => formatHours(m / 60)), fromTracker: true },
    { label: 'Hours watched', value: from('hoursWatched', (h) => compactCount(Math.round(h))), fromTracker: true },
    { label: 'Followers gained', value: from('followersGained', formatSigned), fromTracker: true },
  ]
}

/**
 * The streamer's own channel as a row of chips: followers and subscribers from Twitch, the rest
 * from TwitchTracker's 30-day summary and tagged TT. A figure that is not available is a dash,
 * never a 0, and every chip keeps the same height whether it is loading, empty or full, so the
 * page does not jump when TwitchTracker answers.
 */
export default function StreamerRow({
  followers,
  subscribers,
  tracker,
  trackerLoading,
  trackerUnavailable,
  login,
}: StreamerRowProps) {
  const trackerUrl = `https://twitchtracker.com/${encodeURIComponent(login)}`
  const noAnswer = tracker === null && !trackerLoading && trackerUnavailable
  const untracked = tracker === null && !trackerLoading && !trackerUnavailable
  const link = (text: string) => (
    <a href={trackerUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--text-primary)' }}>
      {text}
    </a>
  )

  return (
    <section aria-label="Your channel" className="@container flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h3 className="m-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--streamer-text)' }}>
          Your channel
        </h3>
        <p className="m-0 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {noAnswer ? (
            <>{link('TwitchTracker')} figures are unavailable right now; reload to try again</>
          ) : untracked ? (
            <>30-day figures appear here once {link('TwitchTracker')} tracks your channel</>
          ) : (
            <>Figures marked TT come from {link('twitchtracker.com')}, last 30 days</>
          )}
        </p>
      </div>

      <ul aria-label="Your channel stats" className="m-0 grid list-none grid-cols-2 gap-2 p-0 @lg:flex @lg:flex-wrap">
        {chips(followers, subscribers, tracker).map((chip) => (
          <li
            key={chip.label}
            title={chip.fromTracker ? TRACKER_TITLE : undefined}
            className="min-h-[52px] rounded-md px-3 py-2"
            style={{ backgroundColor: 'var(--streamer-box)', border: '1px solid var(--streamer-border)' }}
          >
            <small className="block text-[10px] uppercase tracking-wider" style={{ color: 'var(--streamer-label)' }}>
              {chip.label}
            </small>
            <b
              className={chip.large ? 'text-base' : 'text-sm'}
              style={{ color: 'var(--streamer-text)', fontFamily: 'var(--font-mono)' }}
            >
              {chip.fromTracker && trackerLoading ? LOADING : (chip.value ?? MISSING)}
              {chip.fromTracker && (
                <span
                  className="ml-1.5 rounded px-1 align-middle text-[9px] font-normal"
                  style={{ color: 'var(--streamer-label)', border: '1px solid var(--streamer-border)' }}
                >
                  TT
                </span>
              )}
            </b>
          </li>
        ))}
      </ul>
    </section>
  )
}
