/**
 * Which live video a linked YouTube channel is streaming, for its chat pop-out. A rail answer from the last 15 minutes
 * that lists the channel is used as is (0 units); otherwise one uploads + one videos call (2 units). Never throws.
 */
import { fetchLiveSubscriptions } from './youtubeLive'
import { readLiveLast } from './youtubeLiveStore'
import type { YoutubeChatTarget } from './youtubeChatTarget'

/** An older answer may name a stream that has ended or been restarted under a new video id. */
const FRESH_MS = 15 * 60_000

export interface LinkedYoutube {
  channelId: string
  title: string
}

export function fastYoutubeChatTarget(link: LinkedYoutube, now: number = Date.now()): YoutubeChatTarget | null {
  const last = readLiveLast()
  if (!last || last.checkedAt === null || now - last.checkedAt > FRESH_MS) return null
  const s = last.streams.find((x) => x.channelId === link.channelId)
  return s ? { kind: 'video', videoId: s.videoId } : null
}

export async function findYoutubeChatTarget(link: LinkedYoutube, now: number = Date.now()): Promise<YoutubeChatTarget> {
  const fast = fastYoutubeChatTarget(link, now)
  if (fast) return fast
  const r = await fetchLiveSubscriptions([{ id: link.channelId, title: link.title }], { avatars: false })
  if (r.status === 'quota') return { kind: 'failed', reason: 'quota' }
  if (r.status === 'error') return { kind: 'failed', reason: 'error' }
  const s = r.streams.find((x) => x.channelId === link.channelId)
  return s ? { kind: 'video', videoId: s.videoId } : { kind: 'none', name: link.title }
}
