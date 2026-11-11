import type { TwitchUser } from '../types/twitch'
import { useStreamerHistory } from './useStreamerHistory'
import { useStreamerNumbers } from './useStreamerNumbers'
import { useTrackerSummary } from './useTrackerSummary'

export interface StreamerStats {
  tracker: ReturnType<typeof useTrackerSummary>
  numbers: ReturnType<typeof useStreamerNumbers>
  history: ReturnType<typeof useStreamerHistory>
}

/** An affiliate or partner: the accounts that have the followers and subscriptions data the stats read. */
export function isStreamerTier(user: TwitchUser | null): boolean {
  return user?.broadcaster_type === 'affiliate' || user?.broadcaster_type === 'partner'
}

/**
 * The three streamer data hooks behind one gate. They are called on every render so their order
 * never changes; a null id means "make no request", which is what a non-streamer, a disabled
 * caller and a profile that has not loaded all get.
 */
export function useStreamerStats(
  user: TwitchUser | null,
  enabled: boolean,
  onSessionExpired: () => void,
): StreamerStats {
  const active = enabled && user !== null && isStreamerTier(user)
  const tracker = useTrackerSummary(active ? user.login : null)
  const numbers = useStreamerNumbers(active ? user.id : null, onSessionExpired)
  const history = useStreamerHistory(active ? user.id : null, onSessionExpired)
  return { tracker, numbers, history }
}
