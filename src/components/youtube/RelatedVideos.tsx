import type { CatchupVideo } from '../../lib/catchup'
import CatchupCard from './CatchupCard'

/** Related videos as cards. A related click starts a fresh context, so the links carry none. */
export default function RelatedVideos({ videos, status }: { videos: CatchupVideo[]; status: 'loading' | 'ready' | 'empty' }) {
  return (
    <section aria-label="Related videos" className="flex flex-col gap-3">
      <h2 className="text-base font-bold uppercase tracking-wider font-heading" style={{ color: 'var(--text-primary)' }}>
        Related videos
      </h2>
      {status === 'loading' && (
        <div className="grid gap-3 grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-video rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      )}
      {status === 'empty' && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          No related videos found.
        </p>
      )}
      {status === 'ready' && (
        <div className="grid gap-3 grid-cols-2">
          {videos.map((v) => (
            <CatchupCard key={v.id} video={v} href={`/youtube/${v.id}`} />
          ))}
        </div>
      )}
    </section>
  )
}
