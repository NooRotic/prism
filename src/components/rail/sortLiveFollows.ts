import type { EnrichedFollow } from '../../lib/followsStore'

/** When a channel went live, as a sortable number; 0 when the time is missing or unreadable. */
function wentLiveAt(follow: EnrichedFollow): number {
  const time = follow.startedAt ? Date.parse(follow.startedAt) : NaN
  return Number.isNaN(time) ? 0 : time
}

/**
 * Live follows with the channel that went live most recently first.
 *
 * Twitch lists follows newest-followed first, so the rail used to show the same
 * few channels whoever had just gone live. This order surfaces new streams at
 * the top, and unlike a viewer-count order it only changes when somebody goes
 * live or offline, not every time a viewer count moves, so avatars stay put
 * between those moments. Ties, and channels with no usable start time (sorted
 * last), keep the order they arrived in.
 */
export function sortNewestLiveFirst(follows: EnrichedFollow[]): EnrichedFollow[] {
  return [...follows].sort((a, b) => wentLiveAt(b) - wentLiveAt(a))
}
