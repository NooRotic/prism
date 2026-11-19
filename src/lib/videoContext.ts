/**
 * Where a YouTube video was opened from, for the player page's filmstrip. The address carries it
 * (`?from=catchup` or `?list=<playlistId>`); Catch up saves the queue it was showing so the strip needs no
 * API call. Pure apart from the snapshot's localStorage access, which never throws.
 */
import { STORAGE_KEYS } from '../config/storageKeys'
import type { CatchupVideo } from './catchup'

export type VideoContextSource = { kind: 'catchup' } | { kind: 'playlist'; listId: string } | null

export interface ContextItem {
  id: string
  title: string
  thumbnail: string
}

const SNAPSHOT_MAX = 200
const LIST_ID = /^[\w-]{10,64}$/

export function parseContext(search: string): VideoContextSource {
  const params = new URLSearchParams(search)
  const list = params.get('list')
  if (list && LIST_ID.test(list)) return { kind: 'playlist', listId: list }
  if (params.get('from') === 'catchup') return { kind: 'catchup' }
  return null
}

/** A readable playlist id in a YouTube address. Mixes (RD...), Watch Later and Liked are private or unreadable, so they are skipped. */
export function listIdFromUrl(url: string): string | null {
  try {
    const list = new URL(url).searchParams.get('list')
    if (!list || !LIST_ID.test(list) || /^(RD|WL|LL)/.test(list)) return null
    return list
  } catch {
    return null
  }
}

/** The query string that keeps a context when moving to another video in it. */
export function contextSearch(source: VideoContextSource): string {
  if (!source) return ''
  return source.kind === 'catchup' ? '?from=catchup' : `?list=${source.listId}`
}

export function writeQueueSnapshot(videos: CatchupVideo[]): void {
  try {
    const items: ContextItem[] = videos.slice(0, SNAPSHOT_MAX).map((v) => ({ id: v.id, title: v.title, thumbnail: v.thumbnail }))
    localStorage.setItem(STORAGE_KEYS.LOCAL_CATCHUP_QUEUE, JSON.stringify(items))
  } catch {
    /* storage full or blocked: the strip just will not show */
  }
}

export function readQueueSnapshot(): ContextItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_CATCHUP_QUEUE)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export interface ContextWindow {
  current: ContextItem
  index: number
  total: number
  before: ContextItem[]
  after: ContextItem[]
  prev: ContextItem | null
  next: ContextItem | null
}

/** What is behind and ahead of the current video, or null when it is not in the list. `total` is the full length when only part of the list is loaded. */
export function windowAround(items: ContextItem[], currentId: string, behind = 3, ahead = 6, total?: number): ContextWindow | null {
  const index = items.findIndex((i) => i.id === currentId)
  if (index < 0) return null
  return {
    current: items[index],
    index,
    total: Math.max(total ?? 0, items.length),
    before: items.slice(Math.max(0, index - behind), index),
    after: items.slice(index + 1, index + 1 + ahead),
    prev: items[index - 1] ?? null,
    next: items[index + 1] ?? null,
  }
}
