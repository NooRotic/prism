/** What a viewer pasted to say "this creator is also here": a YouTube channel or a Kick channel. Pure; null means "not recognised". */

export type AccountLink = { platform: 'youtube'; handle: string } | { platform: 'youtube'; channelId: string } | { platform: 'kick'; slug: string }

const HANDLE = /^[A-Za-z0-9._-]{3,30}$/
const CHANNEL_ID = /^UC[\w-]{22}$/
const KICK_SLUG = /^[a-z0-9_-]{2,25}$/
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com']
const KICK_HOSTS = ['kick.com', 'www.kick.com']
/** First path segments on kick.com that are pages, not channels. */
const KICK_RESERVED = ['categories', 'category', 'video', 'videos', 'clips', 'clip', 'browse', 'search', 'following', 'dashboard', 'settings', 'terms-of-service', 'privacy-policy', 'community-guidelines']

export function parseAccountLink(input: string): AccountLink | null {
  const text = input.trim()
  if (!text) return null

  // A bare handle or channel id.
  const bareHandle = /^@([A-Za-z0-9._-]{3,30})$/.exec(text)
  if (bareHandle) return { platform: 'youtube', handle: bareHandle[1] }
  if (CHANNEL_ID.test(text)) return { platform: 'youtube', channelId: text }

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const parts = url.pathname.split('/').filter(Boolean)

  if (YT_HOSTS.includes(url.hostname)) {
    const first = parts[0] ?? ''
    if (first.startsWith('@')) {
      const handle = first.slice(1)
      return HANDLE.test(handle) ? { platform: 'youtube', handle } : null
    }
    if (first === 'channel' && CHANNEL_ID.test(parts[1] ?? '')) return { platform: 'youtube', channelId: parts[1] }
    return null
  }

  if (KICK_HOSTS.includes(url.hostname)) {
    const slug = (parts[0] ?? '').toLowerCase()
    return KICK_SLUG.test(slug) && !KICK_RESERVED.includes(slug) ? { platform: 'kick', slug } : null
  }
  return null
}
