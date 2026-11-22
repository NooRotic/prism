/**
 * The viewer's own links between a creator's accounts ("this Twitch channel is also that YouTube channel"), kept in this
 * browser. One record per Twitch login. `confirmed` means both bios named each other when it was checked; otherwise
 * it is the viewer's own claim. Never throws.
 */
import { STORAGE_KEYS } from '../config/storageKeys'

export const MAX_LINKS = 200

export interface LinkRecord {
  /** Twitch login, lower case. */
  twitch: string
  youtube?: { channelId: string; title: string; handle?: string }
  kick?: { slug: string }
  confirmed: boolean
  linkedAt: number
}

function valid(x: unknown): x is LinkRecord {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  if (typeof r.twitch !== 'string' || !r.twitch || typeof r.confirmed !== 'boolean' || typeof r.linkedAt !== 'number') return false
  const yt = r.youtube as Record<string, unknown> | undefined
  const kick = r.kick as Record<string, unknown> | undefined
  const hasYt = !!yt && typeof yt.channelId === 'string' && typeof yt.title === 'string'
  const hasKick = !!kick && typeof kick.slug === 'string'
  return hasYt || hasKick
}

export function getLinks(): LinkRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_LINKED_ACCOUNTS) ?? '[]')
    return Array.isArray(raw) ? raw.filter(valid).slice(0, MAX_LINKS) : []
  } catch {
    return []
  }
}

function write(list: LinkRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_LINKED_ACCOUNTS, JSON.stringify(list))
  } catch {
    /* storage unavailable: not remembered */
  }
}

export function findByTwitch(login: string): LinkRecord | null {
  const key = login.toLowerCase()
  return getLinks().find((l) => l.twitch === key) ?? null
}

export function findByYoutube(channelId: string): LinkRecord | null {
  return getLinks().find((l) => l.youtube?.channelId === channelId) ?? null
}

/** Saves the link at the front, replacing any earlier record for the same Twitch login. */
export function saveLink(record: LinkRecord): void {
  const twitch = record.twitch.toLowerCase()
  write([{ ...record, twitch }, ...getLinks().filter((l) => l.twitch !== twitch)].slice(0, MAX_LINKS))
}

export function removeLink(login: string): void {
  const key = login.toLowerCase()
  write(getLinks().filter((l) => l.twitch !== key))
}
