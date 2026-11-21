import { useCallback, useRef, useState } from 'react'
import { latestFromChannel } from '../lib/channelLatestApi'
import { parseLatestQuery } from '../lib/latestQuery'
import { searchTopic } from '../lib/videoPageApi'
import type { YouTubeVideo } from '../lib/youtubeApi'

export type GridSearch =
  | { status: 'searching'; heading: string }
  | { status: 'ready'; heading: string; videos: YouTubeVideo[] }
  | { status: 'notfound' | 'error'; heading: string }

/**
 * The YouTube grid's search box. "latest <youtuber> video" shows that channel's newest uploads (about 2 quota
 * units); anything else is an ordinary search (100 units, cached 24 h). `search` is null when no search is showing.
 */
export function useGridSearch() {
  const [search, setSearch] = useState<GridSearch | null>(null)
  const generation = useRef(0)

  const run = useCallback(async (text: string) => {
    const q = text.trim()
    if (!q) return
    const gen = ++generation.current
    const channel = parseLatestQuery(q)
    const heading = channel ? `Latest from ${channel}` : `Results for ${q}`
    setSearch({ status: 'searching', heading })
    if (channel) {
      const result = await latestFromChannel(channel)
      if (gen !== generation.current) return
      if (result.status === 'ok') setSearch({ status: 'ready', heading: `Latest from ${result.channelTitle || channel}`, videos: result.videos })
      else setSearch({ status: result.status, heading })
      return
    }
    const found = await searchTopic(q)
    if (gen !== generation.current) return
    // searchTopic answers [] for both "nothing" and a failure, so an empty list reads as not found.
    setSearch(
      found.length > 0
        ? { status: 'ready', heading, videos: found.map((v) => ({ ...v, viewCount: undefined, publishedAt: '', description: '' })) }
        : { status: 'notfound', heading },
    )
  }, [])

  const clear = useCallback(() => {
    generation.current++
    setSearch(null)
  }, [])

  return { search, run, clear }
}
