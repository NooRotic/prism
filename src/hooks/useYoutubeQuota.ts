import { useSyncExternalStore } from 'react'
import { isQuotaReached, subscribeQuota } from '../lib/youtubeQuota'

/** True once YouTube has said the daily quota is used up (until it resets at midnight Pacific). */
export function useYoutubeQuotaReached(): boolean {
  return useSyncExternalStore(subscribeQuota, isQuotaReached, () => false)
}
