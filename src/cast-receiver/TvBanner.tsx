import ChannelPicture from '../components/streams/ChannelPicture'
import type { StreamEntry } from '../lib/streamsApi'
import { tvPixels } from './tvPixels'

interface TvBannerProps {
  name: string
  /** The channel's entry in the list, for its picture; a pasted address has none. */
  entry: StreamEntry | null
  group: string | null
  /** "Tuning…", "Paused" and so on, or null. */
  note: string | null
}

/** What is on, along the bottom of the picture. */
export default function TvBanner({ name, entry, group, note }: TvBannerProps) {
  return (
    <div className="tv-banner" data-testid="tv-banner" role="status">
      {entry && <ChannelPicture stream={entry} size={tvPixels(72)} />}
      <div className="tv-banner-text">
        <p className="tv-banner-name">{name}</p>
        {group && <p className="tv-small">{group}</p>}
      </div>
      {note && <p className="tv-banner-note">{note}</p>}
    </div>
  )
}
