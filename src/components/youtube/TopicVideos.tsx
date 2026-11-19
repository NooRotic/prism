import { useTopicSearch } from '../../hooks/useTopicSearch'
import TopicResults from './TopicResults'

/**
 * The player's place while a tag or topic is open: a red bar that returns to the video, then the videos for that topic.
 * One search (100 quota units, cached per topic).
 */
export default function TopicVideos({ topic, onReplay }: { topic: string; onReplay: () => void }) {
  const { status, videos } = useTopicSearch(topic)
  return (
    <section aria-label="Topic videos" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onReplay}
        className="w-full rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-wider font-heading cursor-pointer hover:brightness-110"
        style={{ backgroundColor: 'var(--accent-youtube)', color: '#fff', border: 'none' }}
      >
        Replay video
      </button>
      <h2 className="text-base font-bold uppercase tracking-wider font-heading" style={{ color: 'var(--text-primary)' }}>
        {`Videos for ${topic}`}
      </h2>
      {status === 'searching' && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Searching…
        </p>
      )}
      {status === 'done' && videos.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Nothing found
        </p>
      )}
      {status === 'done' && videos.length > 0 && <TopicResults videos={videos} columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" />}
    </section>
  )
}
