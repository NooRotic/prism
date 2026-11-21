import { useState } from 'react'
import { useTopicSearch } from '../../hooks/useTopicSearch'
import TopicResults from './TopicResults'

const HEADING = 'text-base font-bold uppercase tracking-wider font-heading'

function TopicList({ topic }: { topic: string }) {
  const { status, videos } = useTopicSearch(topic)
  return (
    <>
      <h2 className={HEADING} style={{ color: 'var(--text-primary)' }}>
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
    </>
  )
}

/**
 * The related-videos column when the video's Mix gave nothing. It offers the video's first topic as a button;
 * the search (100 quota units) runs only when the viewer clicks it, never on page load.
 */
export default function RelatedByTopic({ topic }: { topic: string }) {
  const [asked, setAsked] = useState(false)
  return (
    <section aria-label="Related videos" className="flex flex-col gap-3">
      {asked ? (
        <TopicList topic={topic} />
      ) : (
        <>
          <h2 className={HEADING} style={{ color: 'var(--text-primary)' }}>
            Related videos
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No related videos found.
          </p>
          <button
            type="button"
            onClick={() => setAsked(true)}
            className="self-start rounded-full px-3 py-1.5 text-sm font-medium cursor-pointer hover:brightness-110"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            {`Find videos for ${topic}`}
          </button>
        </>
      )}
    </section>
  )
}
