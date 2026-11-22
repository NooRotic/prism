/**
 * The rail's last answer to "which subscriptions are live", shared by everything that learns about it: the rail's check
 * (useYoutubeLive) and the YouTube player page, which sees a video's live state for free in a call it makes anyway.
 * Changes are announced in this tab (a window event) and in other tabs (`storage`). Never throws.
 */
import { STORAGE_KEYS } from '../config/storageKeys'
import type { StoredChannel } from './catchupStore'
import type { LiveStream } from './youtubeLive'

export const LIVE_LAST_CHANGED = 'prism:youtube-live-changed'

export interface LiveLast {
  /** When a check last ran; null when only the player page has reported anything. */
  checkedAt: number | null
  streams: LiveStream[]
}

/** What the player page knows about one video. */
export interface VideoLiveSighting {
  videoId: string
  channelId: string
  channelTitle: string
  title: string
  isLive: boolean
  viewerCount: number | null
  startedAt: string | null
}

export function readLiveLast(): LiveLast | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_YOUTUBE_LIVE_LAST) ?? 'null')
    if (v && (typeof v.checkedAt === 'number' || v.checkedAt === null) && Array.isArray(v.streams)) return v as LiveLast
  } catch {
    /* damaged: no last answer */
  }
  return null
}

export function writeLiveLast(last: LiveLast): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_YOUTUBE_LIVE_LAST, JSON.stringify(last))
  } catch {
    /* storage unavailable: the answer just is not remembered */
  }
  window.dispatchEvent(new Event(LIVE_LAST_CHANGED))
}

export function subscribeLiveLast(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEYS.LOCAL_YOUTUBE_LIVE_LAST) cb()
  }
  window.addEventListener(LIVE_LAST_CHANGED, cb)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(LIVE_LAST_CHANGED, cb)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * The stored answer after the player page saw one video: a live video of a subscribed channel becomes that channel's
 * entry; a video that is not live leaves the list. Null when nothing changes. Never touches `checkedAt`.
 */
export function applySighting(last: LiveLast | null, s: VideoLiveSighting, subscriptions: StoredChannel[]): LiveLast | null {
  const streams = last?.streams ?? []
  const checkedAt = last?.checkedAt ?? null
  if (!s.isLive) {
    if (!streams.some((x) => x.videoId === s.videoId)) return null
    return { checkedAt, streams: streams.filter((x) => x.videoId !== s.videoId) }
  }
  const sub = subscriptions.find((c) => c.id === s.channelId)
  if (!sub) return null
  const old = streams.find((x) => x.channelId === s.channelId)
  const entry: LiveStream = {
    channelId: s.channelId,
    channelTitle: sub.title || s.channelTitle,
    videoId: s.videoId,
    title: s.title,
    viewerCount: s.viewerCount,
    startedAt: s.startedAt,
    avatarUrl: old?.avatarUrl ?? '',
  }
  return {
    checkedAt,
    streams: old ? streams.map((x) => (x.channelId === s.channelId ? entry : x)) : [...streams, entry],
  }
}
