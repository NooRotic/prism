import {
  getFollowedChannelsPage,
  getStreamsByUserIds,
  SessionExpiredError,
} from './twitchApi'
import { logger } from './logger'
import type { TwitchFollowedChannel, TwitchStream } from '../types/twitch'

/** How often who-is-live is re-read while the app is open and visible. */
export const LIVE_REFRESH_MS = 60_000
/** How often the follow list itself is reloaded; it changes far less often. */
export const FOLLOWS_REFRESH_MS = 5 * 60_000
/** Returning to the tab refreshes at once if the data is older than this. */
export const STALE_ON_RETURN_MS = 30_000
/** Opening the Following panel refreshes if the data is older than this. */
export const PANEL_OPEN_MAX_AGE_MS = 15_000

/**
 * Pages fetched on a fresh load: 4 x 100 = 400 follows. A cursor is kept so
 * the user can load more, and a reload keeps however many pages they loaded.
 */
const INITIAL_PAGES = 4
const PAGE_SIZE = 100

/**
 * Enriched follow = the raw `/channels/followed` row joined with the
 * live-state subset from `/streams`. Channels that are offline carry
 * `isLive: false` and their stream-only fields are undefined.
 */
export interface EnrichedFollow {
  broadcaster_id: string
  broadcaster_login: string
  broadcaster_name: string
  followed_at: string
  isLive: boolean
  viewerCount?: number
  gameName?: string
  streamTitle?: string
  thumbnailUrl?: string
  startedAt?: string
}

export interface FollowsSnapshot {
  data: EnrichedFollow[]
  /** Number of follows loaded so far (not the API's `total`). */
  totalCount: number
  /** True only for a first load that has nothing to show yet. */
  loading: boolean
  loadingMore: boolean
  error: string | null
  cursor: string | null
}

export const EMPTY_FOLLOWS: FollowsSnapshot = {
  data: [],
  totalCount: 0,
  loading: false,
  loadingMore: false,
  error: null,
  cursor: null,
}

function enrichFollows(
  follows: TwitchFollowedChannel[],
  liveStreams: TwitchStream[],
): EnrichedFollow[] {
  const streamByUserId = new Map<string, TwitchStream>()
  for (const stream of liveStreams) {
    streamByUserId.set(stream.user_id, stream)
  }
  return follows.map((f) => {
    const stream = streamByUserId.get(f.broadcaster_id)
    if (!stream) {
      return {
        broadcaster_id: f.broadcaster_id,
        broadcaster_login: f.broadcaster_login,
        broadcaster_name: f.broadcaster_name,
        followed_at: f.followed_at,
        isLive: false,
      }
    }
    return {
      broadcaster_id: f.broadcaster_id,
      broadcaster_login: f.broadcaster_login,
      broadcaster_name: f.broadcaster_name,
      followed_at: f.followed_at,
      isLive: true,
      viewerCount: stream.viewer_count,
      gameName: stream.game_name,
      streamTitle: stream.title,
      thumbnailUrl: stream.thumbnail_url,
      startedAt: stream.started_at,
    }
  })
}

type RefreshKind = 'all' | 'live'

/**
 * One user's followed channels: loaded once, shared by everything that shows
 * them (the rail, the Following panel), and kept fresh while someone is
 * looking. It used to be copied into each component that called the hook, and
 * each copy was fetched once and then never touched again, so the rail went
 * stale until a reload and the panel only caught up when it was reopened.
 */
class FollowsStore {
  private snapshot: FollowsSnapshot = EMPTY_FOLLOWS
  private listeners = new Set<() => void>()
  private authHandlers = new Map<() => void, () => void>()
  private follows: TwitchFollowedChannel[] = []
  private liveStreams: TwitchStream[] = []
  private pagesLoaded = 0
  private inFlight: Promise<void> | null = null
  private lastLiveAt = 0
  private lastFullAt = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private active = false
  private readonly userId: string
  private readonly onEmpty: () => void

  // Fields are declared above rather than as constructor parameter properties,
  // which this project's `erasableSyntaxOnly` setting does not allow.
  constructor(userId: string, onEmpty: () => void) {
    this.userId = userId
    this.onEmpty = onEmpty
  }

  // Arrow properties: React needs stable identities for these.

  getSnapshot = (): FollowsSnapshot => this.snapshot

  subscribe = (listener: () => void, onAuthError?: () => void): (() => void) => {
    this.listeners.add(listener)
    if (onAuthError) this.authHandlers.set(listener, onAuthError)
    if (this.listeners.size === 1) this.start()
    return () => {
      this.listeners.delete(listener)
      this.authHandlers.delete(listener)
      if (this.listeners.size === 0) {
        this.stop()
        this.onEmpty()
      }
    }
  }

  /** Reload the follow list and live state now. */
  refetch = (): void => {
    void this.refresh('all')
  }

  /** Re-read who is live, unless the data is already fresher than `maxAgeMs`. */
  refreshIfStale = (maxAgeMs: number = PANEL_OPEN_MAX_AGE_MS): void => {
    if (!this.needsFull() && Date.now() - this.lastLiveAt < maxAgeMs) return
    void this.refresh(this.needsFull() ? 'all' : 'live')
  }

  loadMore = async (): Promise<void> => {
    // Let a refresh in flight finish first, so the two never write over each other.
    if (this.inFlight) await this.inFlight
    const cursor = this.snapshot.cursor
    if (!cursor || this.inFlight) return
    this.inFlight = this.runLoadMore(cursor).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private start() {
    this.active = true
    document.addEventListener('visibilitychange', this.onReturn)
    window.addEventListener('focus', this.onReturn)
    this.timer = setInterval(this.tick, LIVE_REFRESH_MS)
    void this.refresh('all')
  }

  private stop() {
    this.active = false
    document.removeEventListener('visibilitychange', this.onReturn)
    window.removeEventListener('focus', this.onReturn)
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private needsFull(): boolean {
    return (
      this.snapshot.data.length === 0 ||
      this.snapshot.error !== null ||
      Date.now() - this.lastFullAt >= FOLLOWS_REFRESH_MS
    )
  }

  private tick = () => {
    if (document.visibilityState === 'hidden') return
    void this.refresh(this.needsFull() ? 'all' : 'live')
  }

  /** Back on the tab (or window): catch up now rather than waiting for the next tick. */
  private onReturn = () => {
    if (document.visibilityState === 'hidden') return
    if (!this.needsFull() && Date.now() - this.lastLiveAt < STALE_ON_RETURN_MS) return
    void this.refresh(this.needsFull() ? 'all' : 'live')
  }

  private set(patch: Partial<FollowsSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of [...this.listeners]) listener()
  }

  /** One refresh at a time; a request made while one is running joins it. */
  private refresh(kind: RefreshKind): Promise<void> {
    if (this.inFlight) return this.inFlight
    const run = kind === 'live' && this.follows.length > 0 ? this.loadLive() : this.loadAll()
    this.inFlight = run.finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async fetchLive(follows: TwitchFollowedChannel[]): Promise<TwitchStream[]> {
    // Helix takes up to 100 user_ids per /streams call.
    const chunks: string[][] = []
    for (let i = 0; i < follows.length; i += PAGE_SIZE) {
      chunks.push(follows.slice(i, i + PAGE_SIZE).map((f) => f.broadcaster_id))
    }
    const results = await Promise.all(chunks.map((ids) => getStreamsByUserIds(ids)))
    return results.flat()
  }

  private async loadAll(): Promise<void> {
    const first = this.snapshot.data.length === 0
    if (first) this.set({ loading: true, error: null })
    try {
      const wanted = Math.max(INITIAL_PAGES, this.pagesLoaded)
      const follows: TwitchFollowedChannel[] = []
      let cursor: string | null = null
      let pages = 0
      do {
        const page = await getFollowedChannelsPage(this.userId, PAGE_SIZE, cursor ?? undefined)
        follows.push(...page.data)
        cursor = page.cursor
        pages++
      } while (cursor && pages < wanted)

      const liveStreams = await this.fetchLive(follows)
      if (!this.active) return

      this.follows = follows
      this.liveStreams = liveStreams
      this.pagesLoaded = pages
      this.lastFullAt = this.lastLiveAt = Date.now()
      this.set({
        data: enrichFollows(follows, liveStreams),
        totalCount: follows.length,
        cursor,
        loading: false,
        error: null,
      })
    } catch (err) {
      this.fail(err, first)
    }
  }

  private async loadLive(): Promise<void> {
    try {
      const liveStreams = await this.fetchLive(this.follows)
      if (!this.active) return
      this.liveStreams = liveStreams
      this.lastLiveAt = Date.now()
      this.set({ data: enrichFollows(this.follows, liveStreams) })
    } catch (err) {
      this.fail(err, false)
    }
  }

  private async runLoadMore(cursor: string): Promise<void> {
    this.set({ loadingMore: true })
    try {
      const page = await getFollowedChannelsPage(this.userId, PAGE_SIZE, cursor)
      const newStreams = page.data.length > 0 ? await this.fetchLive(page.data) : []
      if (!this.active) return
      this.follows = [...this.follows, ...page.data]
      this.liveStreams = [...this.liveStreams, ...newStreams]
      this.pagesLoaded += 1
      this.set({
        data: enrichFollows(this.follows, this.liveStreams),
        totalCount: this.follows.length,
        cursor: page.cursor,
        loadingMore: false,
      })
    } catch (err) {
      if (err instanceof SessionExpiredError) this.notifyAuthError()
      this.set({ loadingMore: false })
    }
  }

  /**
   * A first load that fails is shown as an error (and retried on the next
   * tick). A refresh that fails keeps what is on screen: one dropped request
   * must not blank a list that was fine a minute ago.
   */
  private fail(err: unknown, first: boolean) {
    if (err instanceof SessionExpiredError) {
      this.set({ loading: false, error: err.message })
      this.notifyAuthError()
      return
    }
    if (first) {
      this.set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load followed channels',
      })
      return
    }
    logger.warn('[follows] refresh failed, keeping the last data:', err)
  }

  private notifyAuthError() {
    for (const handler of [...this.authHandlers.values()]) handler()
  }
}

const stores = new Map<string, FollowsStore>()

/** Subscribe to a user's follows, creating (and starting) the shared store if needed. */
export function subscribeToFollows(
  userId: string,
  listener: () => void,
  onAuthError?: () => void,
): () => void {
  let store = stores.get(userId)
  if (!store) {
    const created: FollowsStore = new FollowsStore(userId, () => {
      if (stores.get(userId) === created) stores.delete(userId)
    })
    stores.set(userId, created)
    store = created
  }
  return store.subscribe(listener, onAuthError)
}

export function getFollowsSnapshot(userId: string): FollowsSnapshot {
  return stores.get(userId)?.getSnapshot() ?? EMPTY_FOLLOWS
}

export function getFollowsStore(userId: string): FollowsStore | undefined {
  return stores.get(userId)
}
