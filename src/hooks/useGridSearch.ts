import { useCallback, useRef, useState } from 'react'
import { latestFromChannel } from '../lib/channelLatestApi'
import { parseLatestQuery } from '../lib/latestQuery'
import { searchTopic } from '../lib/videoPageApi'
import type { SortOrder } from '../lib/sortVideos'
import { withStats } from '../lib/videoStats'
import type { YouTubeVideo } from '../lib/youtubeApi'

export type GridSearch =
  | { status: 'searching'; heading: string }
  | { status: 'ready'; heading: string; videos: YouTubeVideo[] }
  | { status: 'notfound' | 'error'; heading: string }

/**
 * The YouTube grid's search box. "latest <youtuber> video" shows that channel's newest uploads (about 2 quota
 * units); anything else is an ordinary search (100 units, cached 24 h). `search` is null when no search is showing.
 * Results carry view counts and dates (one 1-unit call for the whole list) so the grid can sort them without more searches.
 */
export function useGridSearch() {
  const [search, setSearch] = useState<GridSearch | null>(null)
  const [order, setOrder] = useState<SortOrder>('newest')
  const generation = useRef(0)

  const run = useCallback(async (text: string) => {
    const q = text.trim()
    if (!q) return
    const gen = ++generation.current
    setOrder('newest')
    const channel = parseLatestQuery(q)
    const heading = channel ? `Latest from ${channel}` : `Results for ${q}`
    setSearch({ status: 'searching', heading })
    if (channel) {
      const result = await latestFromChannel(channel)
      if (gen !== generation.current) return
      if (result.status === 'ok') {
        const videos = await withStats(result.videos)
        if (gen !== generation.current) return
        setSearch({ status: 'ready', heading: `Latest from ${result.channelTitle || channel}`, videos })
      }
      else setSearch({ status: result.status, heading })
      return
    }
    const found = await searchTopic(q)
    if (gen !== generation.current) return
    // searchTopic answers [] for both "nothing" and a failure, so an empty list reads as not found.
    if (found.length === 0) {
      setSearch({ status: 'notfound', heading })
      return
    }
    const videos = await withStats(found.map((v) => ({ ...v, viewCount: undefined, publishedAt: '', description: '' })))
    if (gen !== generation.current) return
    setSearch({ status: 'ready', heading, videos })
  }, [])

  const clear = useCallback(() => {
    generation.current++
    setSearch(null)
  }, [])

  return { search, run, clear, order, setOrder }
}
