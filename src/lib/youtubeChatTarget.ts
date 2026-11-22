/**
 * What the YouTube chat pop-out shows, as the short text that travels in its address and on its bus (the "channel" the
 * shared pop-out machinery carries): `looking`, `v:<videoId>[@<channelId>]`, `none:<name>`, `failed:quota|error`. The
 * channel lets a re-attaching page tell whether the window already shows the streamer it is on.
 */
export type YoutubeChatTarget =
  | { kind: 'looking' }
  | { kind: 'video'; videoId: string; channelId?: string }
  | { kind: 'none'; name: string }
  | { kind: 'failed'; reason: 'quota' | 'error' }

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const CHANNEL_ID = /^[A-Za-z0-9_-]+$/

export function encodeTarget(t: YoutubeChatTarget): string {
  switch (t.kind) {
    case 'looking':
      return 'looking'
    case 'video':
      return t.channelId ? `v:${t.videoId}@${t.channelId}` : `v:${t.videoId}`
    case 'none':
      return `none:${t.name}`
    case 'failed':
      return `failed:${t.reason}`
  }
}

/** Anything not recognised reads as still looking: the page will send the real target. */
export function decodeTarget(s: string): YoutubeChatTarget {
  const i = s.indexOf(':')
  const head = i < 0 ? s : s.slice(0, i)
  const rest = i < 0 ? '' : s.slice(i + 1)
  if (head === 'v') {
    const at = rest.indexOf('@')
    const videoId = at < 0 ? rest : rest.slice(0, at)
    const channelId = at < 0 ? undefined : rest.slice(at + 1)
    if (VIDEO_ID.test(videoId) && (channelId === undefined || CHANNEL_ID.test(channelId))) {
      return channelId ? { kind: 'video', videoId, channelId } : { kind: 'video', videoId }
    }
  }
  if (head === 'none' && i >= 0) return { kind: 'none', name: rest }
  if (head === 'failed' && (rest === 'quota' || rest === 'error')) return { kind: 'failed', reason: rest }
  return { kind: 'looking' }
}

/** YouTube refuses to show the chat unless `embed_domain` is the page's own host. */
export function youtubeChatEmbedUrl(videoId: string, host: string): string {
  return `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=${encodeURIComponent(host)}`
}
