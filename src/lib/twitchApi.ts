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
  TwitchHypeTrainEvent,
  TwitchPoll,
  TwitchPrediction,
  TwitchBitsLeader,
} from '../types/twitch'

const CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID

const TWITCH_API_BASE = 'https://api.twitch.tv/helix'

export class SessionExpiredError extends Error {
  constructor() {
    super('Twitch session expired. Please log in again.')
    this.name = 'SessionExpiredError'
  }
}

function getAccessToken(): string | null {
  return localStorage.getItem('twitch_access_token')
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
    localStorage.removeItem('twitch_access_token')
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

export async function getChannelInfo(broadcasterId: string): Promise<TwitchChannel> {
  const data = await twitchApiFetch<{ data: TwitchChannel[] }>('channels', {
    broadcaster_id: broadcasterId,
  })
  if (!data.data?.[0]) throw new Error('Channel not found')
  return data.data[0]
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
    localStorage.removeItem('twitch_access_token')
    throw new SessionExpiredError()
  }
  if (!res.ok) return []
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

export async function getVideos(userId: string, first: number = 50): Promise<TwitchVideo[]> {
  const data = await twitchApiFetch<{ data: TwitchVideo[] }>('videos', {
    user_id: userId,
    first: String(first),
  })
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
): Promise<TwitchBroadcasterSubscriptionsResponse> {
  const data =
    await twitchApiFetch<TwitchBroadcasterSubscriptionsResponse>(
      'subscriptions',
      { broadcaster_id: broadcasterId, first: String(first) },
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

/** VIP list for the broadcaster. Paginated; this returns the first page. */
export async function getBroadcasterVIPs(
  broadcasterId: string,
  first: number = 100,
): Promise<TwitchVIP[]> {
  const data = await twitchApiFetch<{ data: TwitchVIP[] }>('channels/vips', {
    broadcaster_id: broadcasterId,
    first: String(first),
  })
  return data.data ?? []
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

/** Recent hype train events (up to `first`, most recent first). */
export async function getHypeTrainEvents(
  broadcasterId: string,
  first: number = 10,
): Promise<TwitchHypeTrainEvent[]> {
  const data = await twitchApiFetch<{ data: TwitchHypeTrainEvent[] }>(
    'hypetrain/events',
    { broadcaster_id: broadcasterId, first: String(first) },
  )
  return data.data ?? []
}

/** Poll history (completed + active), newest first. */
export async function getBroadcasterPolls(
  broadcasterId: string,
  first: number = 20,
): Promise<TwitchPoll[]> {
  const data = await twitchApiFetch<{ data: TwitchPoll[] }>('polls', {
    broadcaster_id: broadcasterId,
    first: String(first),
  })
  return data.data ?? []
}

/** Prediction history (completed + active), newest first. */
export async function getBroadcasterPredictions(
  broadcasterId: string,
  first: number = 25,
): Promise<TwitchPrediction[]> {
  const data = await twitchApiFetch<{ data: TwitchPrediction[] }>(
    'predictions',
    { broadcaster_id: broadcasterId, first: String(first) },
  )
  return data.data ?? []
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
