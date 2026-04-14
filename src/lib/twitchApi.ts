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
