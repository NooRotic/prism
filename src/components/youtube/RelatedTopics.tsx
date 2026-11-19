import { useState } from 'react'
import { Link } from 'react-router-dom'
import { searchTopic } from '../../lib/videoPageApi'
import type { YouTubeSearchResult } from '../../lib/youtubeApi'
import TagChip from './TagChip'

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
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {results.videos.map((v) => (
            <Link
              key={v.id}
              to={`/youtube/${v.id}`}
              className="flex flex-col rounded-lg overflow-hidden"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="aspect-video" style={{ backgroundColor: '#000' }}>
                {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />}
              </div>
              <div className="p-2 flex flex-col gap-0.5">
                <span className="text-sm font-medium line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                  {v.title}
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  {v.channelTitle}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
