import { useEffect, useMemo, useState } from 'react'
import {
  parseContext,
  readQueueSnapshot,
  windowAround,
  type ContextItem,
  type ContextWindow,
  type VideoContextSource,
} from '../lib/videoContext'
import { getPlaylistItems } from '../lib/videoPageApi'

const MAX_PAGES = 5 // 250 videos
const AHEAD = 6 // videos the strip shows ahead, so a page is read until this many follow the current one

export interface VideoContext {
  source: VideoContextSource
  status: 'none' | 'loading' | 'ready' | 'unreadable'
  strip: ContextWindow | null
}

/**
 * What the filmstrip shows: the saved Catch up queue, or a playlist read page by page until the current video
 * turns up. No source in the address means no strip.
 */
export function useVideoContext(id: string, search: string): VideoContext {
  const source = useMemo(() => parseContext(search), [search])
  const listId = source?.kind === 'playlist' ? source.listId : null
  const [loaded, setLoaded] = useState<{ key: string; items: ContextItem[]; total: number; unreadable: boolean } | null>(null)
  const key = listId ? `${listId}|${id}` : ''

  useEffect(() => {
    if (!listId) return
    let cancelled = false
    ;(async () => {
      const items: ContextItem[] = []
      let total = 0
      let pageToken: string | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = await getPlaylistItems(listId, pageToken)
        if (cancelled) return
        if (r.status === 'unreadable') {
          setLoaded({ key, items: [], total: 0, unreadable: true })
          return
        }
        items.push(...r.items)
        total = r.totalResults
        const at = items.findIndex((i) => i.id === id)
        if (!r.nextPageToken || (at >= 0 && items.length - at - 1 >= AHEAD)) break
        pageToken = r.nextPageToken
      }
      setLoaded({ key, items, total, unreadable: false })
    })()
    return () => {
      cancelled = true
    }
  }, [listId, id, key])

  return useMemo<VideoContext>(() => {
    if (!source) return { source, status: 'none', strip: null }
    if (source.kind === 'catchup') {
      return { source, status: 'ready', strip: windowAround(readQueueSnapshot(), id) }
    }
    if (!loaded || loaded.key !== key) return { source, status: 'loading', strip: null }
    if (loaded.unreadable) return { source, status: 'unreadable', strip: null }
    return { source, status: 'ready', strip: windowAround(loaded.items, id, undefined, undefined, loaded.total) }
  }, [source, loaded, key, id])
}
