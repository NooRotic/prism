import { useEffect, useState } from 'react'
import { searchTopic } from '../lib/videoPageApi'
import type { YouTubeSearchResult } from '../lib/youtubeApi'

type Answer = { topic: string; videos: YouTubeSearchResult[] }

/**
 * The videos for one topic. One search (100 quota units, cached per topic), run when `topic` changes.
 * While the answer is for an older topic the status stays `searching`, so a stale list is never shown.
 */
export function useTopicSearch(topic: string): { status: 'searching' | 'done'; videos: YouTubeSearchResult[] } {
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
  return answer?.topic === topic ? { status: 'done', videos: answer.videos } : { status: 'searching', videos: [] }
}
