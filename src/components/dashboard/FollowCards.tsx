import { Link } from 'react-router-dom'
import { compactCount, formatCompactDuration } from '../../lib/dashboardStats'
import type { EnrichedFollow } from '../../lib/followsStore'

interface FollowCardsProps {
  /** The most recently started live follows, newest first. */
  recent: EnrichedFollow[]
  /** The most watched live follows, most viewers first. */
  top: EnrichedFollow[]
  now: number
}

function uptimeText(follow: EnrichedFollow, now: number): string {
  const started = follow.startedAt ? Date.parse(follow.startedAt) : NaN
  return Number.isNaN(started) ? '–' : formatCompactDuration(now - started)
}

interface CardProps {
  title: string
  follows: EnrichedFollow[]
  figure: (follow: EnrichedFollow) => string
  figureColour: string
}

function Card({ title, follows, figure, figureColour }: CardProps) {
  if (follows.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h3>
      <div
        className="flex flex-col rounded-md p-2"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {follows.map((f) => (
          <Link
            key={f.broadcaster_id}
            to={`/twitch/${f.broadcaster_login}`}
            className="flex justify-between gap-3 rounded px-1 py-1 text-xs transition-colors hover:bg-white/5"
          >
            <span style={{ color: 'var(--text-primary)' }}>{f.broadcaster_name}</span>
            <span style={{ color: figureColour }}>{figure(f)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** The "Just went live" and "Most watched" cards beside the live wall. */
export default function FollowCards({ recent, top, now }: FollowCardsProps) {
  return (
    <>
      <Card
        title="Just went live"
        follows={recent}
        figure={(f) => uptimeText(f, now)}
        figureColour="var(--accent-green)"
      />
      <Card
        title="Most watched"
        follows={top}
        figure={(f) => compactCount(f.viewerCount ?? 0)}
        figureColour="var(--text-primary)"
      />
    </>
  )
}
