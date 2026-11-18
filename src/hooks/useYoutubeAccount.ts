import { useMemo, useSyncExternalStore } from 'react'
import { getAccount, getSubscriptions, type StoredAccount } from '../lib/catchupStore'
import { isGoogleAuthConfigured } from '../lib/googleYoutubeAuth'
import { getYoutubeImportSnapshot, subscribeYoutubeImport } from '../lib/youtubeImport'

export interface YoutubeAccountView {
  importing: boolean
  revision: number
  /** Which account the subscriptions came from, or null (never imported, imported before records existed, or damaged). */
  account: StoredAccount | null
  subscriptionCount: number
  /** An account record or a non-empty subscription list. */
  imported: boolean
  /** False in builds without a Google client id: there is nothing to import with. */
  configured: boolean
}

/** What PRISM holds from the viewer's YouTube import: cheap localStorage reads, re-read after every import. Loads nothing. */
export function useYoutubeAccount(): YoutubeAccountView {
  const { importing, revision } = useSyncExternalStore(subscribeYoutubeImport, getYoutubeImportSnapshot, getYoutubeImportSnapshot)
  const stored = useMemo(() => {
    void revision
    return { account: getAccount(), subscriptionCount: getSubscriptions().length }
  }, [revision])
  return {
    importing,
    revision,
    account: stored.account,
    subscriptionCount: stored.subscriptionCount,
    imported: stored.account !== null || stored.subscriptionCount > 0,
    configured: isGoogleAuthConfigured(),
  }
}
