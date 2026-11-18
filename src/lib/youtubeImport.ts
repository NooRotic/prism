import { STORAGE_KEYS } from '../config/storageKeys'
import { getMyChannel, listSubscriptions } from './catchupApi'
import { setAccount, setSubscriptions } from './catchupStore'
import { GoogleAuthError, requestYoutubeReadToken } from './googleYoutubeAuth'

/**
 * The one-time YouTube subscription import, shared by the Catch up page and the header's Accounts row.
 * Google's sign-in gives a read-only token that is used once and dropped: nothing here stays signed in, and nothing
 * here ever signs the viewer out of YouTube. Only one import runs at a time, whichever place started it.
 */

export type ImportResult = { status: 'done' } | { status: 'busy' } | { status: 'failed'; message: string }

export interface YoutubeImportSnapshot {
  importing: boolean
  /** +1 after each successful import, here or in another tab. */
  revision: number
}

let snapshot: YoutubeImportSnapshot = { importing: false, revision: 0 }
const listeners = new Set<() => void>()

function update(next: Partial<YoutubeImportSnapshot>): void {
  snapshot = { ...snapshot, ...next }
  for (const listener of [...listeners]) listener()
}

export function getYoutubeImportSnapshot(): YoutubeImportSnapshot {
  return snapshot
}

// Another tab's import writes the subscriptions, drops the lane cache and writes the account: three storage events
// for one import. Only the two that matter count, and a burst of them counts once.
const WATCHED_KEYS = new Set<string>([STORAGE_KEYS.LOCAL_CATCHUP_SUBSCRIPTIONS, STORAGE_KEYS.LOCAL_CATCHUP_ACCOUNT])
const STORAGE_DEBOUNCE_MS = 100
let storageTimer: ReturnType<typeof setTimeout> | null = null
let storageAttached = false

function onStorage(e: StorageEvent): void {
  if (e.key === null || !WATCHED_KEYS.has(e.key)) return
  if (storageTimer) clearTimeout(storageTimer)
  storageTimer = setTimeout(() => {
    storageTimer = null
    update({ revision: snapshot.revision + 1 })
  }, STORAGE_DEBOUNCE_MS)
}

export function subscribeYoutubeImport(listener: () => void): () => void {
  listeners.add(listener)
  if (!storageAttached && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
    storageAttached = true
  }
  return () => {
    listeners.delete(listener)
  }
}

/** What to tell the viewer when an import did not happen. */
export function importFailureMessage(err: unknown): string {
  if (err instanceof GoogleAuthError) {
    if (err.reason === 'closed') return 'The Google sign-in window was closed, so nothing was imported.'
    if (err.reason === 'denied') return 'Google did not allow the sign-in, so nothing was imported.'
    if (err.reason === 'unconfigured') return 'Google sign-in is not set up for this build.'
    return 'Could not reach Google sign-in.'
  }
  return 'Could not read your subscriptions from YouTube.'
}

/**
 * Token, then the subscription list, then (same token) which account it is; a failed account lookup keeps the
 * import with an empty title and picture. A call while one runs answers `busy` at once. Never throws.
 */
export async function importYoutubeSubscriptions(): Promise<ImportResult> {
  if (snapshot.importing) return { status: 'busy' }
  update({ importing: true })
  try {
    const token = await requestYoutubeReadToken()
    const channels = await listSubscriptions(token)
    let mine: Awaited<ReturnType<typeof getMyChannel>> = null
    try {
      mine = await getMyChannel(token)
    } catch {
      mine = null
    }
    setSubscriptions(channels)
    setAccount({ title: mine?.title ?? '', thumbnailUrl: mine?.thumbnailUrl ?? '', importedAt: Date.now() })
    update({ importing: false, revision: snapshot.revision + 1 })
    return { status: 'done' }
  } catch (err) {
    update({ importing: false })
    return { status: 'failed', message: importFailureMessage(err) }
  }
}
