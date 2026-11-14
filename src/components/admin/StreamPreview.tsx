import { useMemo, useState } from 'react'
import { LISTED_STATES, type AdminStream } from '../../lib/adminApi'
import { buildStreamPath } from '../../lib/routes'
import { toStreamAddress } from '../../lib/streamSource'
import { detectURLType, detectURLTypeAs, type StreamKind } from '../../lib/urlDetection'
import StreamPlayerPanel from '../player/StreamPlayerPanel'

const KIND_LABEL: Record<StreamKind, string> = { hls: 'HLS', dash: 'DASH', mp4: 'MP4' }
const BUTTON = 'rounded border px-2 py-1 text-xs'
const BORDER = { borderColor: 'var(--border-accent)' }

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** True when this page's player can take the address: http(s), and not a Twitch or YouTube address (those have their own pages). */
function canPlay(url: string): boolean {
  if (toStreamAddress(url, false) === null) return false
  const { type } = detectURLType(url)
  return type !== 'twitch' && type !== 'youtube'
}

interface StreamPreviewProps {
  stream: AdminStream
  onClose: () => void
}

/**
 * One playlist stream, played where it is listed, so the owner can see whether it works. The player is the one the stream
 * page uses (retry, error card); "try as" only changes what is previewed here and saves nothing. The address is shown as
 * its host, like the rest of the screen. The caller keys this on the stream, so a different stream starts at its own type.
 */
export default function StreamPreview({ stream, onClose }: StreamPreviewProps) {
  const [kind, setKind] = useState<StreamKind>(stream.kind)
  const playable = canPlay(stream.url)
  // Stable between renders: the player restarts the stream whenever the detection it is handed is a new object, so a source
  // rebuilt on every render would retry a failed stream each time anything else on the screen changed. The stored kind is a
  // classification of the address, not a check that it plays, so the other types stay on offer in the error card ("try as").
  const source = useMemo(
    () => ({ url: stream.url, detection: detectURLTypeAs(stream.url, kind), kind, guessedKind: true }),
    [stream.url, kind],
  )
  // A stream visitors can see opens on the page they get; any other has no page of its own, so it opens through the pasted-address form.
  const href = LISTED_STATES.includes(stream.state) ? `/hls-dash/${stream.publicId}` : buildStreamPath(stream.url, kind)

  return (
    <section aria-label={`Preview of ${stream.name}`} className="flex max-w-[640px] flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {playable && (
          <span>
            Playing as {KIND_LABEL[kind]} · {hostOf(stream.url)}
          </span>
        )}
        <span className="ml-auto inline-flex gap-2">
          {playable && (
            <a href={href} target="_blank" rel="noopener noreferrer" className={BUTTON} style={BORDER}>
              Open in a new tab
            </a>
          )}
          <button type="button" onClick={onClose} className={BUTTON} style={BORDER}>
            Close
          </button>
        </span>
      </div>
      {playable ? (
        <StreamPlayerPanel
          key={`${stream.url}|${kind}`}
          source={source}
          heading={false}
          className="flex w-full flex-col gap-2"
          onTryAs={setKind}
        />
      ) : (
        <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>
          This address cannot be played here.
        </p>
      )}
    </section>
  )
}
