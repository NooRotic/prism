import { useState } from 'react'
import { formatCount, formatPublished } from '../../lib/videoFormat'
import type { VideoPageData } from '../../lib/videoPageApi'
import TagChip from './TagChip'
import AlsoOnTwitch from './AlsoOnTwitch'

/**
 * The video's title, on its own so the page can put the columns under it. While the details load it holds the
 * space; when they cannot be had (no such video, no key, YouTube refusing) it says so instead of leaving a gap.
 */
export function VideoTitle({ data, unavailable = false }: { data: VideoPageData | null; unavailable?: boolean }) {
  if (!data && unavailable) {
    return (
      <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
        Details for this video aren't available.
      </p>
    )
  }
  if (!data) return <div className="h-16" aria-hidden="true" />
  return (
    <h1 className="text-xl md:text-2xl font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>
      {data.title}
    </h1>
  )
}

interface Props {
  data: VideoPageData | null
  /** Tags shown before a "+N more" button. */
  maxTags?: number
  /** False when the page renders the title itself (see VideoTitle). */
  showTitle?: boolean
  /** Makes each tag a button that opens that topic; plain text when absent. */
  onTopic?: (topic: string) => void
}

/** Title, channel, views, upload date and the tag row. */
export default function VideoMeta({ data, maxTags = 8, showTitle = true, onTopic }: Props) {
  const [expanded, setExpanded] = useState(false)
  if (!data) return showTitle ? <div className="h-16" aria-hidden="true" /> : null
  const shown = expanded ? data.tags : data.tags.slice(0, maxTags)
  const hidden = data.tags.length - shown.length
  const stats = [data.viewCount ? `${formatCount(data.viewCount)} views` : '', formatPublished(data.publishedAt)].filter(Boolean)
  return (
    <div className="flex flex-col gap-2">
      {showTitle && <VideoTitle data={data} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {data.channelTitle}
        </span>
        <AlsoOnTwitch channelId={data.channelId} />
        {stats.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      {data.tags.length > 0 && (
        <div role="group" aria-label="Tags" className="flex flex-wrap gap-2 pt-1">
          {shown.map((t) => (
            <TagChip key={t} label={t} onClick={onTopic ? () => onTopic(t) : undefined} />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-sm font-medium px-2 py-1 cursor-pointer"
              style={{ color: 'var(--accent-youtube)', background: 'none', border: 'none' }}
            >
              {`+${hidden} more`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
