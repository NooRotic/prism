import { useMemo, useSyncExternalStore } from 'react'
import { STORAGE_KEYS } from '../config/storageKeys'
import { findByTwitch, subscribeLinks, type LinkRecord } from '../lib/linkedAccounts'

const raw = () => {
  try {
    return localStorage.getItem(STORAGE_KEYS.LOCAL_LINKED_ACCOUNTS) ?? ''
  } catch {
    return ''
  }
}

/** The viewer's link for a Twitch channel, re-read whenever a link is saved or removed, here or in another tab. */
export function useLinkedAccount(login: string): LinkRecord | null {
  const snapshot = useSyncExternalStore(subscribeLinks, raw, () => '')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `snapshot` is the stored text: a change in it is what makes this read again
  return useMemo(() => findByTwitch(login), [login, snapshot])
}
