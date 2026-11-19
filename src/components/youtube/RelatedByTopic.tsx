import { useTopicSearch } from '../../hooks/useTopicSearch'
import TopicResults from './TopicResults'

/**
 * The related-videos column when the video's Mix gave nothing: the videos for the video's first topic instead.
 * One search (100 quota units, cached per topic), so it only runs here and never when the Mix has videos.
 */
export default function RelatedByTopic({ topic }: { topic: string }) {
  const { status, videos } = useTopicSearch(topic)
  return (
    <section aria-label="Related videos" className="flex flex-col gap-3">
      <h2 className="text-base font-bold uppercase tracking-wider font-heading" style={{ color: 'var(--text-primary)' }}>
        {`Related videos to ${topic}`}
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
      {status === 'done' && videos.length > 0 && <TopicResults videos={videos} columns="grid-cols-2" />}
    </section>
  )
}
