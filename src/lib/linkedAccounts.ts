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

const listeners = new Set<() => void>()

/** Calls `listener` whenever a link is saved or removed here, or changed in another tab. Returns the unsubscribe. */
export function subscribeLinks(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEYS.LOCAL_LINKED_ACCOUNTS) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function write(list: LinkRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_LINKED_ACCOUNTS, JSON.stringify(list))
  } catch {
    /* storage unavailable: not remembered */
  }
  listeners.forEach((l) => l())
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

/** Twitch channels whose suggested same-name YouTube channel the viewer rejected ("not them"). */
function dismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_LINK_DISMISSED) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function isDismissed(login: string): boolean {
  return dismissed().includes(login.toLowerCase())
}

export function dismissSuggestion(login: string): void {
  try {
    const key = login.toLowerCase()
    localStorage.setItem(STORAGE_KEYS.LOCAL_LINK_DISMISSED, JSON.stringify([key, ...dismissed().filter((l) => l !== key)].slice(0, MAX_LINKS)))
  } catch {
    /* storage unavailable: asked again next time */
  }
}

export function removeLink(login: string): void {
  const key = login.toLowerCase()
  write(getLinks().filter((l) => l.twitch !== key))
}

/** A record with neither a YouTube nor a Kick part says nothing, so it is not kept. */
const hasAny = (r: LinkRecord) => !!r.youtube || !!r.kick

/**
 * Links a YouTube channel to a Twitch channel from the YouTube side. A Kick link already on that Twitch record is kept;
 * any other Twitch record holding this YouTube channel loses it (and is dropped if nothing is left), so a YouTube
 * channel is never linked to two Twitch channels.
 */
export function linkYoutubeToTwitch(login: string, youtube: { channelId: string; title: string; handle?: string }, confirmed: boolean): void {
  const twitch = login.toLowerCase()
  const list = getLinks()
  const existing = list.find((l) => l.twitch === twitch)
  const others = list
    .filter((l) => l.twitch !== twitch)
    .map((l) => (l.youtube?.channelId === youtube.channelId ? { ...l, youtube: undefined } : l))
    .filter(hasAny)
  const record: LinkRecord = { twitch, youtube, ...(existing?.kick ? { kick: existing.kick } : {}), confirmed, linkedAt: Date.now() }
  write([record, ...others].slice(0, MAX_LINKS))
}

/** Removes this YouTube channel from whichever Twitch record holds it, keeping a Kick-only remainder. */
export function unlinkYoutube(channelId: string): void {
  write(
    getLinks()
      .map((l) => (l.youtube?.channelId === channelId ? { ...l, youtube: undefined } : l))
      .filter(hasAny),
  )
}

function dismissedYoutube(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_LINK_DISMISSED_YOUTUBE) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function isYoutubeSuggestionDismissed(channelId: string): boolean {
  return dismissedYoutube().includes(channelId)
}

export function dismissYoutubeSuggestion(channelId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_LINK_DISMISSED_YOUTUBE, JSON.stringify([channelId, ...dismissedYoutube().filter((c) => c !== channelId)].slice(0, MAX_LINKS)))
  } catch {
    /* storage unavailable: asked again next time */
  }
}
