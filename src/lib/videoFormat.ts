/** Small text helpers for the YouTube player page and the video cards. Pure. */

/** A count as 1.2M / 34K / 512. Empty for nothing or a value that is not a number. */
export function formatCount(n?: string | number): string {
  if (n === undefined || n === '') return ''
  const v = typeof n === 'number' ? n : parseInt(n, 10)
  if (!Number.isFinite(v)) return ''
  const short = (x: number, unit: string) => `${x.toFixed(1).replace(/\.0$/, '')}${unit}`
  if (v >= 1_000_000_000) return short(v / 1_000_000_000, 'B')
  if (v >= 1_000_000) return short(v / 1_000_000, 'M')
  if (v >= 1_000) return short(v / 1_000, 'K')
  return String(v)
}

const DAY = 86_400_000

/** Relative under a year ("3 days ago"), a calendar date from a year on ("Nov 3, 2025"). Empty if unparsable. */
export function formatPublished(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const days = Math.floor((now - t) / DAY)
  if (days >= 365) return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`
  if (days < 1) return 'today'
  if (days < 30) return plural(days, 'day')
  return plural(Math.floor(days / 30), 'month')
}

export interface TextPart {
  text: string
  href?: string
}

/** Text split into plain parts and http(s) links. Trailing punctuation stays outside the link. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '')
    const start = m.index ?? 0
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: url, href: url })
    last = start + url.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts.length ? parts : [{ text }]
}
