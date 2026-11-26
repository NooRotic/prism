import { memo } from 'react'
import QrCode from '../components/cast/QrCode'
import ChannelPicture from '../components/streams/ChannelPicture'
import CountryFlag from '../components/streams/CountryFlag'
import type { CastStream } from '../lib/cast/messages'
import { shareUrl, type QrStyle } from '../lib/cast/qrCode'
import type { StreamEntry } from '../lib/streamsApi'
import TvRing from './TvRing'
import { tvPixels } from './tvPixels'

interface TvShareCardProps {
  stream: CastStream
  /** Its entry in the list, for its picture; null without a list or for a pasted address. */
  entry: StreamEntry | null
  group: string | null
  qrStyle: QrStyle
  /** The channel failed or has finished: the card says so. */
  notWorking: boolean
}

/**
 * What is on, with a code a phone can scan to open it in PRISM (and star it there, or share it from the phone's own browser).
 * The code holds only the channel's id: a pasted address, which has none and can carry a token, gets no code.
 */
export default memo(function TvShareCard({ stream, entry, group, qrStyle, notWorking }: TvShareCardProps) {
  return (
    <TvRing as="aside" className="tv-card" data-testid="tv-card" role="status">
      <div className="tv-card-head">
        {entry ? (
          <ChannelPicture stream={entry} size={tvPixels(72)} />
        ) : (
          // No list: the picture the computer sent, if any.
          stream.logo && <img className="tv-card-logo" src={stream.logo} alt="" width={tvPixels(72)} height={tvPixels(72)} />
        )}
        <div className="tv-card-title">
          <p className="tv-card-name">{stream.name}</p>
          {(group || entry?.country) && (
            <p className="tv-small tv-card-where">
              {group}
              <CountryFlag code={entry?.country ?? null} size={tvPixels(28)} />
            </p>
          )}
        </div>
      </div>
      {notWorking && <p className="tv-card-hint tv-card-down">Not available right now</p>}
      {stream.id !== null ? (
        <>
          <QrCode text={shareUrl(stream.id)} styleName={qrStyle} className="tv-card-qr" />
          <p className="tv-card-hint">Scan to watch it on your phone, star it or share it</p>
        </>
      ) : (
        <p className="tv-card-hint">Only channels from PRISM&apos;s list can be shared from the TV</p>
      )}
      <p className="tv-small tv-card-keys">◂ ▸ or Back closes</p>
    </TvRing>
  )
})
