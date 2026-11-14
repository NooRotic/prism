import { useState } from 'react'
import { logoUrl, type StreamEntry } from '../../lib/streamsApi'

interface ChannelPictureProps {
  stream: Pick<StreamEntry, 'id' | 'name' | 'logo'>
  /** Width and height in pixels. */
  size: number
}

/** A colour that belongs to a stream: the same id always gives the same hue, and white text reads on every one. */
function tileColour(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360}, 50%, 30%)`
}

/** The first character of the name (a whole emoji counts as one), or a question mark when there is no name. */
function firstLetter(name: string): string {
  const first = Array.from(name.trim())[0]
  return first ? first.toUpperCase() : '?'
}

/**
 * The channel's picture: PRISM's own copy of its logo, or, when there is none or it does not load, a tile with the
 * first letter of the name. The picture is decoration (the name is always next to it), so it has no text alternative.
 */
export default function ChannelPicture({ stream, size }: ChannelPictureProps) {
  const [failedFile, setFailedFile] = useState<string | null>(null)
  const src = stream.logo !== null ? logoUrl(stream.logo) : null

  if (src !== null && stream.logo !== failedFile) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedFile(stream.logo)}
        className="shrink-0 rounded-md object-contain"
        style={{ width: size, height: size, background: 'var(--border-accent)' }}
      />
    )
  }
  return (
    <span
      data-letter-tile
      className="flex shrink-0 items-center justify-center rounded-md font-semibold"
      style={{
        width: size,
        height: size,
        background: tileColour(stream.id),
        color: '#fff',
        fontFamily: 'var(--font-mono)',
        fontSize: Math.round(size * 0.45),
      }}
    >
      {firstLetter(stream.name)}
    </span>
  )
}
