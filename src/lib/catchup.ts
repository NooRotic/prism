/** Pure logic for the YouTube Catch up page: id parsing, durations, the 2 S : 1 W : 1 R blend. No I/O. */

/** Why a video is in the queue: S = new from a subscription, W = Watch Later, R = related. */
export type Lane = 'S' | 'W' | 'R'

export const LANE_LABEL: Record<Lane, string> = {
  S: 'New from your subscriptions',
  W: 'From your Watch Later',
  R: 'Related to what you watched',
}

export interface CatchupVideo {
  id: string
  title: string
  channel: string
  publishedAt: string
  durationSec: number
  thumbnail: string
  tag?: Lane
}

const VIDEO_ID = /^[\w-]{11}$/

/** A video id from a bare id or any youtube.com / youtu.be address. */
export function parseVideoId(input: string): string | null {
  const s = input.trim()
  if (VIDEO_ID.test(s)) return s
  try {
    const u = new URL(s)
    if (u.hostname === 'youtu.be') return VIDEO_ID.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null
    const v = u.searchParams.get('v')
    if (v && VIDEO_ID.test(v)) return v
    const m = u.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{11})/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Every video id found in free text (one per line, or a pasted block). Deduped, in order. */
export function parseVideoIds(text: string): string[] {
  const out: string[] = []
  for (const token of text.split(/[\s,]+/)) {
    const id = token ? parseVideoId(token) : null
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/** A channel's uploads playlist: its `UC…` id with `UU` in place of `UC`. Null for anything else. */
export function uploadsPlaylistId(channelId: string): string | null {
  return /^UC[\w-]{22}$/.test(channelId) ? `UU${channelId.slice(2)}` : null
}

/** ISO-8601 duration (PT1H2M3S) in seconds. Live and upcoming streams report P0D: 0. */
export function parseDuration(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return 0
  const [, d, h, mi, s] = m
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0)
}

export function formatDuration(sec: number): string {
  if (sec <= 0) return 'live'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The 50 / 25 / 25 blend: two subscription uploads, then one Watch Later, then one related, repeated.
 * A lane that runs dry is skipped and the others keep their order. A video already placed is not repeated.
 */
export function blend(subs: CatchupVideo[], later: CatchupVideo[], related: CatchupVideo[]): CatchupVideo[] {
  const lanes: Array<[CatchupVideo[], Lane, number]> = [
    [subs, 'S', 2],
    [later, 'W', 1],
    [related, 'R', 1],
  ]
  const pos = [0, 0, 0]
  const seen = new Set<string>()
  const out: CatchupVideo[] = []
  let progressed = true
  while (progressed) {
    progressed = false
    lanes.forEach(([list, tag, take], i) => {
      let taken = 0
      while (taken < take && pos[i] < list.length) {
        const v = list[pos[i]++]
        if (seen.has(v.id)) continue
        seen.add(v.id)
        out.push({ ...v, tag })
        taken++
        progressed = true
      }
    })
  }
  return out
}
