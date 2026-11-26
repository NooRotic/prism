import PrismIcon from '../components/cast/PrismIcon'
import ChannelPicture from '../components/streams/ChannelPicture'
import type { TvState } from '../lib/cast/messages'
import type { StreamEntry } from '../lib/streamsApi'
import TvRing from './TvRing'
import { tvPixels } from './tvPixels'

interface TvBannerProps {
  name: string
  /** The channel's entry in the list, for its picture; a pasted address has none. */
  entry: StreamEntry | null
  group: string | null
  /** What the channel is doing; null for a flip that waits to be tuned. */
  state: TvState | null
  live: boolean
  /** One line of what the player is doing, or null. */
  debug: string | null
  /** The smaller form beside the open guide. */
  compact?: boolean
}

const WORDS: Partial<Record<TvState, string>> = { tuning: 'Tuning…', buffering: 'Buffering…', paused: 'Paused' }

/** What is on: the state above the name (rainbow while tuning), the player's line under it, PRISM's mark at the end. */
export default function TvBanner({ name, entry, group, state, live, debug, compact = false }: TvBannerProps) {
  const word = state === null ? null : (WORDS[state] ?? (state === 'playing' ? (live ? 'Live' : 'Playing') : null))
  return (
    <TvRing className={compact ? 'tv-banner tv-banner-compact' : 'tv-banner'} data-testid={compact ? 'tv-now' : 'tv-banner'} role="status">
      {entry && <ChannelPicture stream={entry} size={tvPixels(compact ? 56 : 72)} />}
      <div className="tv-banner-text">
        <p className="tv-state">
          {word && <span className={state === 'tuning' ? 'tv-state-rainbow' : undefined}>{word}</span>}
          {word && group && ' · '}
          {group}
        </p>
        <p className="tv-banner-name">{name}</p>
        {debug && <p className="tv-debug">{debug}</p>}
      </div>
      <PrismIcon className="tv-banner-mark" />
    </TvRing>
  )
}
