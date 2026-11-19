import { useState } from 'react'
import { searchTopic } from '../../lib/videoPageApi'
import type { YouTubeSearchResult } from '../../lib/youtubeApi'
import TagChip from './TagChip'
import TopicResults from './TopicResults'

type Results = { topic: string; status: 'searching' | 'done'; videos: YouTubeSearchResult[] }

/**
 * Topic buttons. A click runs one search (100 quota units, cached) and shows the results right here.
 * Without an API key the topics are plain text, because a click could not do anything.
 */
export default function RelatedTopics({ topics, apiAvailable }: { topics: string[]; apiAvailable: boolean }) {
  const [results, setResults] = useState<Results | null>(null)
  if (topics.length === 0) return null

  const pick = (topic: string) => {
    setResults({ topic, status: 'searching', videos: [] })
    searchTopic(topic).then((videos) => setResults((cur) => (cur?.topic === topic ? { topic, status: 'done', videos } : cur)))
  }

  return (
    <section aria-label="Related topics" className="flex flex-col gap-3">
      <h2 className="text-base font-bold uppercase tracking-wider font-heading" style={{ color: 'var(--text-primary)' }}>
        Related topics
      </h2>
      <div className="flex flex-wrap gap-2">
        {topics.map((t) => (
          <TagChip key={t} label={t} onClick={apiAvailable ? () => pick(t) : undefined} />
        ))}
      </div>
      {results?.status === 'searching' && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Searching…
        </p>
      )}
      {results?.status === 'done' && results.videos.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Nothing found
        </p>
      )}
      {results?.status === 'done' && results.videos.length > 0 && (
        <TopicResults videos={results.videos} columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" />
      )}
    </section>
  )
}
