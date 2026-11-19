import { useState } from 'react'
import { formatCount, formatPublished } from '../../lib/videoFormat'
import type { VideoPageData } from '../../lib/videoPageApi'
import TagChip from './TagChip'

/** Title, channel, views, upload date and the tag row. `maxTags` show before a "+N more" button. */
export default function VideoMeta({ data, maxTags = 8 }: { data: VideoPageData | null; maxTags?: number }) {
  const [expanded, setExpanded] = useState(false)
  if (!data) return <div className="h-16" aria-hidden="true" />
  const shown = expanded ? data.tags : data.tags.slice(0, maxTags)
  const hidden = data.tags.length - shown.length
  const stats = [data.viewCount ? `${formatCount(data.viewCount)} views` : '', formatPublished(data.publishedAt)].filter(Boolean)
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl md:text-2xl font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>
        {data.title}
      </h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {data.channelTitle}
        </span>
        {stats.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      {data.tags.length > 0 && (
        <div role="group" aria-label="Tags" className="flex flex-wrap gap-2 pt-1">
          {shown.map((t) => (
            <TagChip key={t} label={t} />
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
