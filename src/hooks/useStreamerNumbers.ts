import { getBroadcasterFollowerCount, getBroadcasterSubscriptions } from '../lib/twitchApi'
import { useSection, type Section } from './streamerSection'

async function loadSubscriberCount(broadcasterId: string): Promise<number> {
  return (await getBroadcasterSubscriptions(broadcasterId, 1)).total
}

/**
 * The two Twitch-sourced figures on the streamer row: total followers and subscribers. Each loads
 * and fails on its own, so a channel that cannot read subscriptions still shows its followers.
 * Pass a null id to make no request.
 */
export function useStreamerNumbers(
  broadcasterId: string | null,
  onSessionExpired: () => void,
): { followers: Section<number>; subscribers: Section<number> } {
  const followers = useSection(broadcasterId, getBroadcasterFollowerCount, onSessionExpired)
  const subscribers = useSection(broadcasterId, loadSubscriberCount, onSessionExpired)
  return { followers, subscribers }
}
