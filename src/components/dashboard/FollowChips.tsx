import { compactCount, formatCompactDuration } from '../../lib/dashboardStats'
import type { FollowStats } from '../../lib/dashboardStats'

interface FollowChipsProps {
  stats: FollowStats
  /** True while more follows are still to be loaded, which makes the loaded count a floor, not a total. */
  more: boolean
}

const MISSING = '–'

/** The row of figures about the viewer's live follows. */
export default function FollowChips({ stats, more }: FollowChipsProps) {
  const languages = stats.languages
    .slice(0, 3)
    .map((l) => `${l.language.toUpperCase()} ${l.count}`)
    .join(' · ')

  const chips: { label: string; value: string; accent?: boolean }[] = [
    { label: 'Live now', value: `${stats.liveCount} / ${stats.loadedCount}${more ? '+' : ''}`, accent: true },
    { label: 'Watching (all follows)', value: compactCount(stats.watching) },
    {
      label: 'Typical time live',
      value: stats.typicalUptimeMs === null ? MISSING : formatCompactDuration(stats.typicalUptimeMs),
    },
    { label: 'Just went live', value: String(stats.justWentLive) },
    {
      label: 'Longest live',
      value: stats.longest ? `${formatCompactDuration(stats.longest.ms)} · ${stats.longest.name}` : MISSING,
    },
    { label: 'Languages', value: languages || MISSING },
    {
      label: 'Oldest follow live',
      value: stats.oldestLive ? `${stats.oldestLive.name} · ${stats.oldestLive.year}` : MISSING,
    },
  ]

  return (
    <ul aria-label="Follow stats" className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:flex md:flex-wrap">
      {chips.map((chip) => (
        <li
          key={chip.label}
          className="min-h-[52px] rounded-md px-3 py-2"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <small
            className="block text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {chip.label}
          </small>
          <b
            className="text-sm"
            style={{
              color: chip.accent ? 'var(--accent-green)' : 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {chip.value}
          </b>
        </li>
      ))}
    </ul>
  )
}
