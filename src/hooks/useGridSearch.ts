import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { latestFromChannel, moreFromChannel } from '../lib/channelLatestApi'
import { parseLatestQuery } from '../lib/latestQuery'
import { addSearch, clearSearchHistory, getSearchHistory } from '../lib/youtubeSearchHistory'
import { SORT_LABELS, type SortOrder } from '../lib/sortVideos'
import { searchTopicPage } from '../lib/videoPageApi'
import { withStats } from '../lib/videoStats'
import type { YouTubeVideo } from '../lib/youtubeApi'

/** "Load all" stops here: at 50 videos a unit this is 20 units, and a grid of more than this is not browsable anyway. */
export const LOAD_ALL_CAP = 1000

export interface ReadySearch {
  status: 'ready'
  heading: string
  videos: YouTubeVideo[]
  /** A channel's uploads ("latest <youtuber>") or an ordinary search. */
  kind: 'channel' | 'search'
  /** How many videos the channel has, when known. */
  total: number | null
  /** True while another page is still to be had. */
  more: boolean
  loadingMore: boolean
  /** The last attempt to load more failed (what is loaded stays). */
  moreError: boolean
  /** "Load all" stopped at the cap with pages left. */
  capped: boolean
}

export type GridSearch = { status: 'searching'; heading: string } | ReadySearch | { status: 'notfound' | 'error'; heading: string }

/** Where the next page comes from. Held beside the state, not in it: it is not shown. */
type Cursor = { kind: 'channel'; playlistId: string; token: string | null } | { kind: 'search'; query: string; token: string | null }

const SORTS = Object.keys(SORT_LABELS) as SortOrder[]

/**
 * The YouTube grid's search box. "latest <youtuber> video" shows that channel's newest uploads (about 2 quota
 * units, then 1 per 50 more); anything else is an ordinary search (100 units a page, cached 24 h).
 *
 * The search and its sort live in the address (`?q=...&sort=...`): that is what makes the Back button from a video
 * return to the same search, and opening the address again re-runs it (from the cache, so it costs nothing).
 * Results carry view counts and dates (one 1-unit call per page) so the grid can sort them without more searches.
 */
export function useGridSearch() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q')
  const sortParam = params.get('sort')
  const order: SortOrder = SORTS.includes(sortParam as SortOrder) ? (sortParam as SortOrder) : 'newest'

  const [search, setSearch] = useState<GridSearch | null>(null)
  const [recent, setRecent] = useState<string[]>(getSearchHistory)
  const generation = useRef(0)
  const cursor = useRef<Cursor | null>(null)
  // The newest state, written the moment it is decided: a loop that loads page after page must not read a snapshot
  // React has not rendered yet (it would drop the pages loaded in between).
  const latest = useRef<GridSearch | null>(null)
  const put = useCallback((next: GridSearch | null) => {
    latest.current = next
    setSearch(next)
  }, [])

  const execute = useCallback(async (text: string) => {
    const gen = ++generation.current
    cursor.current = null
    const channel = parseLatestQuery(text)
    const heading = channel ? `Latest from ${channel}` : `Results for ${text}`
    put({ status: 'searching', heading })
    if (channel) {
      const result = await latestFromChannel(channel)
      if (gen !== generation.current) return
      if (result.status !== 'ok') {
        put({ status: result.status, heading })
        return
      }
      const videos = await withStats(result.videos)
      if (gen !== generation.current) return
      cursor.current = { kind: 'channel', playlistId: result.playlistId, token: result.nextPageToken }
      put({
        status: 'ready',
        heading: `Latest from ${result.channelTitle || channel}`,
        videos,
        kind: 'channel',
        total: result.total,
        more: result.nextPageToken !== null,
        loadingMore: false,
        moreError: false,
        capped: false,
      })
      return
    }
    const page = await searchTopicPage(text)
    if (gen !== generation.current) return
    // searchTopicPage answers an empty page for both "nothing" and a failure, so an empty list reads as not found.
    if (page.videos.length === 0) {
      put({ status: 'notfound', heading })
      return
    }
    const videos = await withStats(page.videos.map((v) => ({ ...v, viewCount: undefined, publishedAt: '', description: '' })))
    if (gen !== generation.current) return
    cursor.current = { kind: 'search', query: text, token: page.nextPageToken }
    put({
      status: 'ready',
      heading,
      videos,
      kind: 'search',
      total: null,
      more: page.nextPageToken !== null,
      loadingMore: false,
      moreError: false,
      capped: false,
    })
  }, [put])

  // The address is the source of truth: whenever it holds a search, show it; when it holds none, show none.
  useEffect(() => {
    if (!q) {
      generation.current++
      cursor.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the address
      put(null)
      return
    }
    void execute(q)
  }, [q, execute, put])

  const run = useCallback(
    (text: string) => {
      const t = text.trim()
      if (!t) return
      addSearch(t)
      setRecent(getSearchHistory())
      if (t === q) {
        void execute(t) // the address will not change; ask again (from the cache)
        setParams({ q: t })
        return
      }
      setParams({ q: t }) // no sort: a new search starts on Newest
    },
    [q, execute, setParams],
  )

  const clear = useCallback(() => {
    generation.current++
    setParams({})
  }, [setParams])

  const setOrder = useCallback(
    (next: SortOrder) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === 'newest') p.delete('sort')
          else p.set('sort', next)
          return p
        },
        { replace: true },
      )
    },
    [setParams],
  )

  /** One more page onto the list. Returns whether it worked, so "load all" knows when to stop. */
  const loadPage = useCallback(async (): Promise<boolean> => {
    const cur = cursor.current
    const now = latest.current
    if (!cur || cur.token === null || !now || now.status !== 'ready') return false
    const gen = generation.current
    put({ ...now, loadingMore: true, moreError: false })
    const page =
      cur.kind === 'channel'
        ? await moreFromChannel(cur.playlistId, cur.token)
        : await (async () => {
            const p = await searchTopicPage(cur.query, cur.token!)
            return p.videos.length === 0
              ? ({ status: 'error' } as const)
              : ({
                  status: 'ok',
                  videos: p.videos.map((v) => ({ ...v, viewCount: undefined, publishedAt: '', description: '' })),
                  nextPageToken: p.nextPageToken,
                } as const)
          })()
    if (gen !== generation.current) return false
    const base = latest.current
    if (!base || base.status !== 'ready') return false
    if (page.status !== 'ok') {
      put({ ...base, loadingMore: false, moreError: true })
      return false
    }
    const added = await withStats(page.videos)
    if (gen !== generation.current) return false
    const have = new Set(base.videos.map((v) => v.id))
    const videos = [...base.videos, ...added.filter((v) => !have.has(v.id))]
    cursor.current = { ...cur, token: page.nextPageToken }
    put({ ...base, videos, more: page.nextPageToken !== null, loadingMore: false, moreError: false })
    return page.nextPageToken !== null
  }, [put])

  const loadMore = useCallback(async () => {
    await loadPage()
  }, [loadPage])

  /** Every remaining page of a channel's uploads, up to LOAD_ALL_CAP videos. */
  const loadAll = useCallback(async () => {
    const gen = generation.current
    for (;;) {
      const goOn = await loadPage()
      if (!goOn || gen !== generation.current) return
      const now = latest.current
      if (now && now.status === 'ready' && now.videos.length >= LOAD_ALL_CAP) {
        put({ ...now, capped: true })
        return
      }
    }
  }, [loadPage, put])

  const clearRecent = useCallback(() => {
    clearSearchHistory()
    setRecent([])
  }, [])

  return { search, run, clear, order, setOrder, loadMore, loadAll, recent, clearRecent, query: q ?? '' }
}
