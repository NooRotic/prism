/**
 * A creator's Twitch VODs and YouTube videos on one kind of card. Pure.
 * Nothing is ever hidden: a video that looks like the same stream on the other platform is only tagged "also on".
 */
import type { TwitchVideo } from '../types/twitch'
import type { YouTubeVideo } from './youtubeApi'

export type Source = 'all' | 'twitch' | 'youtube'

export interface CombinedItem {
  platform: 'twitch' | 'youtube'
  id: string
  title: string
  thumbnail: string
  /** ISO 8601. Named like YouTubeVideo's so the search grid's sort works on it. */
  publishedAt: string
  /** As text, like YouTubeVideo's. */
  viewCount?: string
  durationSec: number | null
  /** Where it plays: a Twitch VOD's own address, or PRISM's /youtube/<id> page. */
  url?: string
  /** The other platform has a video that is probably the same stream. */
  alsoOn?: 'twitch' | 'youtube'
}

/** Twitch's "3h25m10s" in seconds, or null when it is not a duration. */
export function parseTwitchDuration(text: string): number | null {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text.trim())
  if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

export function twitchToItem(v: TwitchVideo): CombinedItem {
  return {
    platform: 'twitch',
    id: v.id,
    title: v.title,
    thumbnail: v.thumbnail_url ? v.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180').replace('{width}', '320').replace('{height}', '180') : '',
    publishedAt: v.created_at,
    viewCount: String(v.view_count),
    durationSec: parseTwitchDuration(v.duration),
    url: v.url,
  }
}

export function youtubeToItem(v: YouTubeVideo): CombinedItem {
  return {
    platform: 'youtube',
    id: v.id,
    title: v.title,
    thumbnail: v.thumbnail,
    publishedAt: v.publishedAt,
    viewCount: v.viewCount,
    durationSec: null,
    url: `/youtube/${v.id}`,
  }
}

export function filterBySource(items: CombinedItem[], source: Source): CombinedItem[] {
  return source === 'all' ? items : items.filter((i) => i.platform === source)
}

const WINDOW_MS = 36 * 60 * 60 * 1000
const words = (title: string) =>
  new Set(
    title
      .normalize('NFKC')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3),
  )

/** Share of the smaller title's words that the other title has too. */
function overlap(a: string, b: string): number {
  const x = words(a)
  const y = words(b)
  const small = x.size <= y.size ? x : y
  const large = small === x ? y : x
  if (small.size === 0) return 0
  let shared = 0
  for (const w of small) if (large.has(w)) shared++
  return shared / small.size
}

/**
 * Tags a Twitch VOD and a YouTube video as "also on" each other when they are within 36 hours and share at least
 * half their title words. Each video pairs with at most one on the other side (the closest in time). Returns copies;
 * the list keeps its order and length.
 */
export function flagLikelyDuplicates(items: CombinedItem[]): CombinedItem[] {
  const out = items.map((i) => ({ ...i, alsoOn: undefined as CombinedItem['alsoOn'] }))
  const time = (i: CombinedItem) => Date.parse(i.publishedAt)
  const pairs: Array<{ a: number; b: number; gap: number }> = []
  out.forEach((a, ai) => {
    if (a.platform !== 'twitch') return
    out.forEach((b, bi) => {
      if (b.platform !== 'youtube') return
      const gap = Math.abs(time(a) - time(b))
      if (Number.isNaN(gap) || gap > WINDOW_MS || overlap(a.title, b.title) < 0.5) return
      pairs.push({ a: ai, b: bi, gap })
    })
  })
  const used = new Set<number>()
  for (const p of pairs.sort((x, y) => x.gap - y.gap)) {
    if (used.has(p.a) || used.has(p.b)) continue
    used.add(p.a)
    used.add(p.b)
    out[p.a].alsoOn = 'youtube'
    out[p.b].alsoOn = 'twitch'
  }
  return out.map((i) => (i.alsoOn ? i : { ...i, alsoOn: undefined }))
}
