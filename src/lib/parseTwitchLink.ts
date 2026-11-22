/**
 * A Twitch channel named in text: what the viewer pasted ("twitch.tv/name", a full address, "@name" or a bare name), or
 * the first channel address in a video description. Pure; returns the login in lower case, or null.
 */

const LOGIN = /^[A-Za-z0-9_]{3,25}$/
const HOSTS = ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv']
/** First path segments on twitch.tv that are pages, not channels. */
const RESERVED = new Set([
  'videos', 'directory', 'settings', 'search', 'downloads', 'jobs', 'turbo', 'subscriptions', 'wallet', 'inventory',
  'drops', 'friends', 'messages', 'p', 'team', 'popout', 'moderator', 'u', 'clip', 'clips', 'login', 'signup', 'store',
  'prime', 'bits', 'broadcast', 'creatorcamp', 'legal', 'privacy', 'following', 'collections', 'event', 'products',
])

export function parseTwitchLogin(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const bare = /^@?([A-Za-z0-9_]+)$/.exec(text)
  if (bare) return LOGIN.test(bare[1]) ? bare[1].toLowerCase() : null

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!HOSTS.includes(url.hostname.toLowerCase())) return null
  const first = url.pathname.split('/').filter(Boolean)[0] ?? ''
  if (!LOGIN.test(first) || RESERVED.has(first.toLowerCase())) return null
  return first.toLowerCase()
}

/** The first `twitch.tv/<channel>` address in free text that names a channel (not a page such as /videos). */
export function firstTwitchMention(text: string): string | null {
  if (!text) return null
  // The address must start the text or follow a character that cannot be part of a host name, so clips.twitch.tv and
  // eviltwitch.tv do not count.
  for (const m of text.matchAll(/(?:^|[^\w.-])((?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/[A-Za-z0-9_]+)/gi)) {
    const login = parseTwitchLogin(m[1])
    if (login) return login
  }
  return null
}
