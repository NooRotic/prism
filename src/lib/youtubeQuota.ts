/**
 * Whether YouTube's daily quota has run out. The key is shared by every visitor, so once one call is told
 * "quotaExceeded" every call fails until the quota resets at midnight Pacific. Kept in memory only: a reload
 * learns it again from its first failed call, which costs nothing.
 */
type Listener = () => void

let until = 0
const listeners = new Set<Listener>()

/** The next midnight in Pacific time, when YouTube resets the quota. */
export function nextQuotaReset(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now)
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const sinceMidnight = n('hour') * 3600 + n('minute') * 60 + n('second')
  // Whole seconds only: drop the sub-second part of `now` so the answer lands exactly on midnight.
  const wholeSecond = Math.floor(now.getTime() / 1000) * 1000
  return new Date(wholeSecond + (86400 - sinceMidnight) * 1000)
}

export function isQuotaReached(): boolean {
  return Date.now() < until
}

export function markQuotaReached(): void {
  const was = isQuotaReached()
  until = nextQuotaReset().getTime()
  if (!was) listeners.forEach((l) => l())
}

/** Call with every failed Data API answer; only a 403 `quotaExceeded` sets the flag. */
export function noteApiFailure(status: number, reason?: string): void {
  if (status === 403 && reason === 'quotaExceeded') markQuotaReached()
}

export function subscribeQuota(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetQuotaForTests(): void {
  until = 0
  listeners.clear()
}
