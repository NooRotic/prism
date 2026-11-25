import ChannelPicture from '../components/streams/ChannelPicture'
import CountryFlag from '../components/streams/CountryFlag'
import type { GuidePosition } from '../lib/cast/remote'
import type { GuideGroup } from '../lib/cast/surf'
import { tvPixels } from './tvPixels'

/** Rows on screen. A group can hold thousands, so only these are drawn. */
const ROWS = 7

interface TvGuideProps {
  groups: GuideGroup[]
  at: GuidePosition
  playingId: string | null
}

/** The channel list, beside the picture that plays on. The remote moves it; nothing here takes focus. */
export default function TvGuide({ groups, at, playingId }: TvGuideProps) {
  const group = groups[at.group]
  const count = group.streams.length
  const first = Math.max(0, Math.min(at.row - Math.floor(ROWS / 2), count - ROWS))

  return (
    <aside className="tv-guide">
      <p className="tv-guide-group">
        <span aria-hidden="true">◂</span>
        {group.key === 'favorites' && (
          <span aria-hidden="true" className="tv-heart">
            ♥
          </span>
        )}
        <span className="tv-guide-label">{group.label}</span>
        <span aria-hidden="true">▸</span>
      </p>
      <ul role="listbox" aria-label={group.label} className="tv-rows">
        {group.streams.slice(first, first + ROWS).map((stream, index) => {
          const selected = first + index === at.row
          const playing = stream.id === playingId
          return (
            <li key={stream.id} role="option" aria-selected={selected} aria-current={playing ? 'true' : undefined} className="tv-row">
              <ChannelPicture stream={stream} size={tvPixels(44)} />
              <span className="tv-row-name">{stream.name}</span>
              <CountryFlag code={stream.country} size={tvPixels(32)} />
              {playing && (
                <span aria-hidden="true" className="tv-row-playing">
                  ▶
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="tv-small tv-guide-foot">
        {at.row + 1} of {count} · OK watch · Back close
      </p>
    </aside>
  )
}
