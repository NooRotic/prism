import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import StreamUptime from '../channel/StreamUptime'
import type { RailEntry } from './types'

const AVATAR_SIZE = 40

interface RailEntryCardProps {
  entry: RailEntry
  expanded: boolean
}

/**
 * Avatar with an initial-letter fallback. Covers both "we never got a URL"
 * (the /users join failed or was partial) and "the URL 404s at render time".
 * A missing avatar must never leave a hole in the rail.
 */
function RailAvatar({ entry }: { entry: RailEntry }) {
  const [failed, setFailed] = useState(false)

  if (!entry.avatarUrl || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          background: 'var(--accent-twitch)',
          color: '#fff',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {entry.displayName.charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      src={entry.avatarUrl}
      alt=""
      role="presentation"
      width={AVATAR_SIZE}
      height={AVATAR_SIZE}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full"
      style={{
        outline: entry.isLive ? '2px solid var(--accent-green)' : 'none',
        outlineOffset: '1px',
      }}
    />
  )
}

/**
 * One rail entry. The collapsed circle and the expanded row are the same
 * element at two widths — not two components — so expanding never remounts
 * the avatar or restarts the uptime tick.
 */
export default function RailEntryCard({ entry, expanded }: RailEntryCardProps) {
  return (
    <Link
      to={entry.href}
      aria-label={entry.displayName}
      title={entry.streamTitle ?? entry.displayName}
      className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-white/5"
    >
      <RailAvatar entry={entry} />

      {expanded && (
        <div className="flex min-w-0 flex-col">
          <span
            className="truncate text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            {entry.displayName}
          </span>
          <div className="flex items-center gap-2">
            <span
              data-testid="rail-live-dot"
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: 'var(--accent-green)' }}
            />
            {entry.viewerCount !== null && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Users size={11} />
                {entry.viewerCount.toLocaleString()}
              </span>
            )}
            {entry.startedAt && <StreamUptime startedAt={entry.startedAt} />}
          </div>
        </div>
      )}
    </Link>
  )
}
