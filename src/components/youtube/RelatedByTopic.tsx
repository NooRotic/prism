import { useEffect, useState } from 'react'
import { searchTopic } from '../../lib/videoPageApi'
import type { YouTubeSearchResult } from '../../lib/youtubeApi'
import TopicResults from './TopicResults'

type Answer = { topic: string; videos: YouTubeSearchResult[] }

/**
 * The related-videos column when the video's Mix gave nothing: the videos for the video's first topic instead.
 * One search (100 quota units, cached per topic), so it only runs here and never when the Mix has videos.
 */
export default function RelatedByTopic({ topic }: { topic: string }) {
  const [answer, setAnswer] = useState<Answer | null>(null)
  useEffect(() => {
    let cancelled = false
    searchTopic(topic).then((videos) => {
      if (!cancelled) setAnswer({ topic, videos })
    })
    return () => {
      cancelled = true
    }
  }, [topic])
  const done = answer?.topic === topic ? answer : null

  return (
    <section aria-label="Related videos" className="flex flex-col gap-3">
      <h2 className="text-base font-bold uppercase tracking-wider font-heading" style={{ color: 'var(--text-primary)' }}>
        {`Related videos to ${topic}`}
      </h2>
      {!done && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Searching…
        </p>
      )}
      {done && done.videos.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Nothing found
        </p>
      )}
      {done && done.videos.length > 0 && <TopicResults videos={done.videos} columns="grid-cols-2" />}
    </section>
  )
}
