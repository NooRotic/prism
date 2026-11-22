import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadsPlaylistId } from '../lib/catchup'
import { moreFromChannel } from '../lib/channelLatestApi'
import { withStats } from '../lib/videoStats'
import type { YouTubeVideo } from '../lib/youtubeApi'

export type UploadsStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * A YouTube channel's uploads (past live streams are among them), 50 a page, read only once `enabled` is true:
 * the first page when it turns on (1 unit, plus 1 for view counts), more on `loadMore`. Closing and reopening keeps
 * what was loaded and asks for nothing.
 */
export function useChannelUploads(channelId: string | undefined, enabled: boolean) {
  const [videos, setVideos] = useState<YouTubeVideo[]>([])
  const [status, setStatus] = useState<UploadsStatus>('idle')
  const [loadingMore, setLoadingMore] = useState(false)
  const [next, setNext] = useState<string | null>(null)
  const startedFor = useRef<string | null>(null)
  const generation = useRef(0)

  // A different channel starts over.
  useEffect(() => {
    generation.current++
    startedFor.current = null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new channel starts empty
    setVideos([])
    setStatus('idle')
    setNext(null)
    setLoadingMore(false)
  }, [channelId])

  useEffect(() => {
    if (!enabled || !channelId || startedFor.current === channelId) return
    const playlist = uploadsPlaylistId(channelId)
    if (!playlist) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a channel id with no uploads list cannot be read
      setStatus('error')
      return
    }
    startedFor.current = channelId
    const gen = generation.current
    setStatus('loading')
    void (async () => {
      const page = await moreFromChannel(playlist)
      if (gen !== generation.current) return
      if (page.status !== 'ok') {
        startedFor.current = null // a later open tries again
        setStatus('error')
        return
      }
      const withNumbers = await withStats(page.videos)
      if (gen !== generation.current) return
      setVideos(withNumbers)
      setNext(page.nextPageToken)
      setStatus('ready')
    })()
  }, [enabled, channelId])

  const loadMore = useCallback(async () => {
    if (!channelId || next === null || loadingMore) return
    const playlist = uploadsPlaylistId(channelId)
    if (!playlist) return
    const gen = generation.current
    setLoadingMore(true)
    const page = await moreFromChannel(playlist, next)
    if (gen !== generation.current) return
    if (page.status !== 'ok') {
      setLoadingMore(false)
      setStatus('error')
      return
    }
    const added = await withStats(page.videos)
    if (gen !== generation.current) return
    setVideos((prev) => {
      const have = new Set(prev.map((v) => v.id))
      return [...prev, ...added.filter((v) => !have.has(v.id))]
    })
    setNext(page.nextPageToken)
    setLoadingMore(false)
  }, [channelId, next, loadingMore])

  return { videos, status, loadingMore, hasMore: next !== null, loadMore }
}
