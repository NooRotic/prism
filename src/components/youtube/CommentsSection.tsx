import { ExternalLink } from 'lucide-react'
import { formatCount, formatPublished } from '../../lib/videoFormat'
import type { CommentsResult } from '../../lib/videoPageApi'

const plural = (n: number, one: string, many: string) => `${formatCount(n) || 0} ${n === 1 ? one : many}`

/** Read-only comments (plain text) and a link to write one on YouTube. `result` is null while loading. */
export default function CommentsSection({ videoId, result }: { videoId: string; result: CommentsResult | null }) {
  return (
    <section aria-label="Comments" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold uppercase tracking-wider font-heading" style={{ color: 'var(--text-primary)' }}>
          Comments
        </h2>
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
          style={{ color: '#fff', backgroundColor: 'var(--accent-youtube)' }}
        >
          Comment on YouTube
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
      {result === null && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      )}
      {result?.status === 'disabled' && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Comments are turned off for this video.
        </p>
      )}
      {result?.status === 'error' && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Couldn't load comments.
        </p>
      )}
      {result?.status === 'ok' && (
        <ul className="flex flex-col gap-3">
          {result.comments.map((c) => (
            <li
              key={c.id}
              className="flex gap-3 rounded-lg p-3"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              {c.authorImage && <img src={c.authorImage} alt="" loading="lazy" className="w-9 h-9 rounded-full shrink-0" />}
              <div className="min-w-0 flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {c.author}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{formatPublished(c.publishedAt)}</span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
                  {c.text}
                </p>
                <div className="flex gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span>{plural(c.likeCount, 'like', 'likes')}</span>
                  {c.replyCount > 0 && <span>{plural(c.replyCount, 'reply', 'replies')}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
