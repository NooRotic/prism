import type {
  TwitchUser,
  TwitchChannel,
  TwitchStream,
  TwitchClip,
  TwitchVideo,
  TwitchGame,
  TwitchEmote,
  TwitchBadge,
  TwitchFollowedChannel,
  TwitchBroadcasterSubscriptionsResponse,
  TwitchGoal,
  TwitchVIP,
  TwitchPoll,
  TwitchPrediction,
  TwitchBitsLeader,
} from '../types/twitch'
import { STORAGE_KEYS } from '../config/storageKeys'

const CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID

const TWITCH_API_BASE = 'https://api.twitch.tv/helix'

export class SessionExpiredError extends Error {
  constructor() {
    super('Twitch session expired. Please log in again.')
    this.name = 'SessionExpiredError'
  }
}

function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)
}

async function twitchApiFetch<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${TWITCH_API_BASE}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v))

  const token = getAccessToken()
  const headers: Record<string, string> = { 'Client-ID': CLIENT_ID }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url.toString(), { headers })

  if (res.status === 401) {
    localStorage.removeItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)
    throw new SessionExpiredError()
  }

  if (!res.ok) {
    let errMsg = await res.text()
    try {
      errMsg = JSON.parse(errMsg).message
    } catch {
      // keep raw text
    }
    throw new Error(`Twitch API error: ${res.status} ${errMsg}`)
  }

  return res.json()
}

// --- User & Channel ---

export async function getUserInfo(username: string): Promise<TwitchUser> {
  const data = await twitchApiFetch<{ data: TwitchUser[] }>('users', { login: username })
  if (!data.data?.[0]) throw new Error('User not found')
  return data.data[0]
}

/**
 * Fetch the authenticated user's own profile. Helix `/users` with no
 * params returns the user that owns the access token.
 */
export async function getAuthenticatedUser(): Promise<TwitchUser> {
  const data = await twitchApiFetch<{ data: TwitchUser[] }>('users')
  if (!data.data?.[0]) throw new Error('Authenticated user not found')
  return data.data[0]
}

/**
 * The name colour a user picked for Twitch chat, as `#RRGGBB`, or null when they
 * never set one (Twitch answers with an empty string). Needs no extra scope.
 */
export async function getChatColor(userId: string): Promise<string | null> {
  const data = await twitchApiFetch<{ data: { color: string }[] }>('chat/color', {
    user_id: userId,
  })
  return data.data?.[0]?.color || null
}

export async function getChannelInfo(broadcasterId: string): Promise<TwitchChannel> {
  const data = await twitchApiFetch<{ data: TwitchChannel[] }>('channels', {
    broadcaster_id: broadcasterId,
  })
  if (!data.data?.[0]) throw new Error('Channel not found')
  return data.data[0]
}

/** Helix caps id params per request on /users and /streams alike. */
const HELIX_ID_CHUNK_SIZE = 100

/**
 * Batch-fetch profile data for multiple user IDs.
 *
 * Unlike `getStreamsByUserIds`, which truncates at 100 because a stream list
 * is already a "top N", every requested profile matters here — so ids are
 * chunked and the chunks merged.
 *
 * A single failing chunk does not fail the call: its ids are simply absent
 * from the result, and callers fall back to an initial-letter avatar. A 401
 * is the exception — an expired session is global, not per-chunk, so it
 * propagates.
 */
export async function getUsersByIds(userIds: string[]): Promise<TwitchUser[]> {
  if (userIds.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < userIds.length; i += HELIX_ID_CHUNK_SIZE) {
    chunks.push(userIds.slice(i, i + HELIX_ID_CHUNK_SIZE))
  }

  const results = await Promise.all(
    chunks.map(async (ids) => {
      const url = new URL(`${TWITCH_API_BASE}/users`)
      ids.forEach((id) => url.searchParams.append('id', id))

      const token = getAccessToken()
      const headers: Record<string, string> = { 'Client-ID': CLIENT_ID }
      if (token) headers['Authorization'] = `Bearer ${token}`

      let res: Response
      try {
        res = await fetch(url.toString(), { headers })
      } catch {
        // Network-level failure for this chunk only.
        return [] as TwitchUser[]
      }

      if (res.status === 401) {
        localStorage.removeItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)
        throw new SessionExpiredError()
      }
      if (!res.ok) return [] as TwitchUser[]

      const data = await res.json()
      return (data.data ?? []) as TwitchUser[]
    }),
  )

  return results.flat()
}

// --- Streams ---

export async function getStreams(userId: string): Promise<TwitchStream | null> {
  const data = await twitchApiFetch<{ data: TwitchStream[] }>('streams', { user_id: userId })
  return data.data?.[0] ?? null
}

/**
 * Batch-fetch live stream data for multiple user_ids in a single request.
 * Helix accepts up to 100 user_id params per /streams call. Channels not
 * currently live are simply omitted from the response, so the result is
 * always a subset of the requested IDs.
 */
export async function getStreamsByUserIds(
  userIds: string[],
): Promise<TwitchStream[]> {
  if (userIds.length === 0) return []
  // Helix supports up to 100 user_id params per request
  const url = new URL(`${TWITCH_API_BASE}/streams`)
  userIds.slice(0, 100).forEach((id) => url.searchParams.append('user_id', id))

  const token = getAccessToken()
  const headers: Record<string, string> = { 'Client-ID': CLIENT_ID }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url.toString(), { headers })
  if (res.status === 401) {
    localStorage.removeItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)
    throw new SessionExpiredError()
  }
  // A failed request is not "nobody is live". Returning [] here made one
  // rate-limit or server error read as every followed channel going offline.
  if (!res.ok) throw new Error(`Twitch /streams request failed (HTTP ${res.status})`)
  const data = await res.json()
  return data.data ?? []
}

// --- Clips ---

export async function getClips(
  broadcasterId: string,
  first: number = 100,
): Promise<TwitchClip[]> {
  const data = await twitchApiFetch<{ data: TwitchClip[] }>('clips', {
    broadcaster_id: broadcasterId,
    first: String(first),
  })
  return data.data ?? []
}

// --- Videos ---

export interface GetVideosOptions {
  /** Only this kind of video; Twitch returns every kind when it is left out. */
  type?: 'all' | 'archive' | 'highlight' | 'upload'
  /** Pagination cursor from an earlier page. */
  after?: string
}

export async function getVideos(
  userId: string,
  first: number = 50,
  options: GetVideosOptions = {},
): Promise<TwitchVideo[]> {
  const params: Record<string, string> = { user_id: userId, first: String(first) }
  if (options.type) params.type = options.type
  if (options.after) params.after = options.after
  const data = await twitchApiFetch<{ data: TwitchVideo[] }>('videos', params)
  return data.data ?? []
}

// --- Games (batch) ---

export async function getGames(ids: string[]): Promise<TwitchGame[]> {
  if (ids.length === 0) return []
  const unique = [...new Set(ids)]
  // Helix supports up to 100 IDs per request
  const url = new URL(`${TWITCH_API_BASE}/games`)
  unique.slice(0, 100).forEach((id) => url.searchParams.append('id', id))

  const token = getAccessToken()
  const headers: Record<string, string> = { 'Client-ID': CLIENT_ID }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) return []
  const data = await res.json()
  return data.data ?? []
}

/**
 * Look up a game/category by its exact display name (e.g. "Just
 * Chatting"). Returns the first match or null if none found. Used by
 * the Category panel to resolve the ProfileSidebar game name into a
 * game_id for /streams?game_id=X.
 */
export async function getGameByName(
  name: string,
): Promise<TwitchGame | null> {
  const data = await twitchApiFetch<{ data: TwitchGame[] }>('games', {
    name,
  })
  return data.data?.[0] ?? null
}

/**
 * Fetch the top `first` live streams for a specific game/category.
 * Public endpoint — no scope required. Streams are returned sorted
 * by viewer count descending by Helix.
 */
export async function getStreamsByGameId(
  gameId: string,
  first: number = 30,
): Promise<TwitchStream[]> {
  const data = await twitchApiFetch<{ data: TwitchStream[] }>('streams', {
    game_id: gameId,
    first: String(first),
  })
  return data.data ?? []
}

// --- Emotes & Badges ---

export async function getChatEmotes(broadcasterId: string): Promise<TwitchEmote[]> {
  const data = await twitchApiFetch<{ data: TwitchEmote[] }>('chat/emotes', {
    broadcaster_id: broadcasterId,
  })
  return data.data ?? []
}

export async function getChatBadges(broadcasterId: string): Promise<TwitchBadge[]> {
  const data = await twitchApiFetch<{ data: TwitchBadge[] }>('chat/badges', {
    broadcaster_id: broadcasterId,
  })
  return data.data ?? []
}

// --- Top Games ---

export async function getTopGames(first: number = 20): Promise<TwitchGame[]> {
  const data = await twitchApiFetch<{ data: TwitchGame[] }>('games/top', {
    first: String(first),
  })
  return data.data ?? []
}

// --- Search ---

export async function searchChannels(query: string, first: number = 10) {
  const data = await twitchApiFetch<{ data: TwitchChannel[] }>('search/channels', {
    query,
    first: String(first),
  })
  return data.data ?? []
}

// --- Followed Channels (auth-gated) ---

export async function getFollowedChannels(
  userId: string,
  first: number = 100,
): Promise<TwitchFollowedChannel[]> {
  const data = await twitchApiFetch<{ data: TwitchFollowedChannel[]; total: number }>(
    'channels/followed',
    { user_id: userId, first: String(first) },
  )
  return data.data ?? []
}

/**
 * Paginated version of getFollowedChannels. Accepts an `after` cursor
 * and returns both the page of follows and the next cursor (if any)
 * so callers can implement a cursor loop up to some safety cap.
 */
export async function getFollowedChannelsPage(
  userId: string,
  first: number = 100,
  after?: string,
): Promise<{ data: TwitchFollowedChannel[]; cursor: string | null }> {
  const params: Record<string, string> = {
    user_id: userId,
    first: String(first),
  }
  if (after) params.after = after
  const response = await twitchApiFetch<{
    data: TwitchFollowedChannel[]
    total: number
    pagination?: { cursor?: string }
  }>('channels/followed', params)
  return {
    data: response.data ?? [],
    cursor: response.pagination?.cursor ?? null,
  }
}

// ─── Streamer stats (phase 2.3) ──────────────────────────────────────
// Each wrapper is a thin layer over twitchApiFetch that handles the
// shape differences between Helix endpoints (some return { data, total,
// points }, some just { data }, etc.). All require the authenticated
// user to be the broadcaster (ownership check on Twitch's side) plus
// the relevant scope from SCOPES in twitchAuth.ts.

/**
 * Returns the first page of a broadcaster's subscribers along with the
 * total count and `points` — the tier-weighted subscription points
 * Twitch uses for emote slot rewards (T1=1, T2=2, T3=6).
 */
export async function getBroadcasterSubscriptions(
  broadcasterId: string,
  first: number = 100,
  after?: string,
): Promise<TwitchBroadcasterSubscriptionsResponse> {
  const params: Record<string, string> = {
    broadcaster_id: broadcasterId,
    first: String(first),
  }
  if (after) params.after = after
  const data =
    await twitchApiFetch<TwitchBroadcasterSubscriptionsResponse>(
      'subscriptions',
      params,
    )
  return {
    data: data.data ?? [],
    total: data.total ?? 0,
    points: data.points ?? 0,
    pagination: data.pagination,
  }
}

/** Active broadcast goals (follower/subscription targets). */
export async function getBroadcasterGoals(
  broadcasterId: string,
): Promise<TwitchGoal[]> {
  const data = await twitchApiFetch<{ data: TwitchGoal[] }>('goals', {
    broadcaster_id: broadcasterId,
  })
  return data.data ?? []
}

/** VIP list for the broadcaster. Accepts optional cursor for pagination. */
export async function getBroadcasterVIPs(
  broadcasterId: string,
  first: number = 100,
  after?: string,
): Promise<{ data: TwitchVIP[]; cursor: string | null }> {
  const params: Record<string, string> = {
    broadcaster_id: broadcasterId,
    first: String(first),
  }
  if (after) params.after = after
  const response = await twitchApiFetch<{
    data: TwitchVIP[]
    pagination?: { cursor?: string }
  }>('channels/vips', params)
  return {
    data: response.data ?? [],
    cursor: response.pagination?.cursor ?? null,
  }
}

/**
 * Total follower count of the authenticated broadcaster's own channel.
 * Requires moderator:read:followers scope even though we only read the
 * `total` field — Helix still gates the endpoint because the full
 * response includes individual follower IDs.
 */
export async function getBroadcasterFollowerCount(
  broadcasterId: string,
): Promise<number> {
  const data = await twitchApiFetch<{ total: number }>('channels/followers', {
    broadcaster_id: broadcasterId,
    first: '1',
  })
  return data.total ?? 0
}

const FOLLOWERS_PAGE_SIZE = 100

/**
 * When the authenticated broadcaster's most recent followers followed, newest first, reading
 * 100 per page until a follow older than `sinceMs` shows up or `maxPages` pages are read.
 * Returns the dates only, never who followed. `total` is the channel's all-time follower
 * count from the first page; `reachedCap` is true when the page limit stopped the read while
 * followers inside the window were still unread, so the dates cover only part of it.
 * Same scope and ownership rule as getBroadcasterFollowerCount.
 */
export async function getFollowerDates(
  broadcasterId: string,
  sinceMs: number,
  maxPages: number = 10,
): Promise<{ dates: string[]; total: number; reachedCap: boolean }> {
  const dates: string[] = []
  let total = 0
  let after: string | undefined

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const params: Record<string, string> = {
      broadcaster_id: broadcasterId,
      first: String(FOLLOWERS_PAGE_SIZE),
    }
    if (after) params.after = after
    const page = await twitchApiFetch<{
      data?: { followed_at: string }[]
      total?: number
      pagination?: { cursor?: string }
    }>('channels/followers', params)

    if (pageNumber === 0) total = page.total ?? 0
    for (const item of page.data ?? []) {
      const followedAt = Date.parse(item.followed_at)
      if (Number.isNaN(followedAt)) continue
      if (followedAt < sinceMs) return { dates, total, reachedCap: false }
      dates.push(item.followed_at)
    }

    after = page.pagination?.cursor
    if (!after) return { dates, total, reachedCap: false }
  }

  return { dates, total, reachedCap: true }
}

/** Poll history (completed + active), newest first. Accepts optional cursor for pagination. */
export async function getBroadcasterPolls(
  broadcasterId: string,
  first: number = 20,
  after?: string,
): Promise<{ data: TwitchPoll[]; cursor: string | null }> {
  const params: Record<string, string> = {
    broadcaster_id: broadcasterId,
    first: String(first),
  }
  if (after) params.after = after
  const response = await twitchApiFetch<{
    data: TwitchPoll[]
    pagination?: { cursor?: string }
  }>('polls', params)
  return {
    data: response.data ?? [],
    cursor: response.pagination?.cursor ?? null,
  }
}

/** Prediction history (completed + active), newest first. Accepts optional cursor for pagination. */
export async function getBroadcasterPredictions(
  broadcasterId: string,
  first: number = 25,
  after?: string,
): Promise<{ data: TwitchPrediction[]; cursor: string | null }> {
  const params: Record<string, string> = {
    broadcaster_id: broadcasterId,
    first: String(first),
  }
  if (after) params.after = after
  const response = await twitchApiFetch<{
    data: TwitchPrediction[]
    pagination?: { cursor?: string }
  }>('predictions', params)
  return {
    data: response.data ?? [],
    cursor: response.pagination?.cursor ?? null,
  }
}

/**
 * Top bits contributors for the authenticated broadcaster. No
 * broadcaster_id param — Twitch infers it from the user's token.
 */
export async function getBitsLeaderboard(
  count: number = 10,
): Promise<TwitchBitsLeader[]> {
  const data = await twitchApiFetch<{ data: TwitchBitsLeader[] }>(
    'bits/leaderboard',
    { count: String(count) },
  )
  return data.data ?? []
}
