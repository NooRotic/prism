import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isQuotaReached, markQuotaReached, nextQuotaReset, noteApiFailure, resetQuotaForTests, subscribeQuota } from '../youtubeQuota'

beforeEach(() => resetQuotaForTests())
afterEach(() => vi.useRealTimers())

describe('nextQuotaReset', () => {
  it('is the next midnight in Pacific time (08:00 UTC in winter)', () => {
    expect(nextQuotaReset(new Date('2026-11-21T10:00:00Z')).toISOString()).toBe('2026-11-22T08:00:00.000Z')
  })

  it('is the next midnight in Pacific time (07:00 UTC in summer)', () => {
    expect(nextQuotaReset(new Date('2026-07-21T10:00:00Z')).toISOString()).toBe('2026-07-22T07:00:00.000Z')
  })

  it('moves to the following day just after midnight Pacific', () => {
    expect(nextQuotaReset(new Date('2026-11-21T08:00:30Z')).toISOString()).toBe('2026-11-22T08:00:00.000Z')
  })
})

describe('the quota flag', () => {
  it('starts clear, is set by a quotaExceeded answer, and tells subscribers', () => {
    const seen = vi.fn()
    const off = subscribeQuota(seen)
    expect(isQuotaReached()).toBe(false)
    noteApiFailure(403, 'quotaExceeded')
    expect(isQuotaReached()).toBe(true)
    expect(seen).toHaveBeenCalledTimes(1)
    off()
  })

  it('ignores other failures', () => {
    noteApiFailure(403, 'commentsDisabled')
    noteApiFailure(500, 'quotaExceeded')
    noteApiFailure(0, 'noKey')
    expect(isQuotaReached()).toBe(false)
  })

  it('clears itself once the reset time has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'))
    markQuotaReached()
    expect(isQuotaReached()).toBe(true)
    vi.setSystemTime(new Date('2026-11-22T08:00:01Z'))
    expect(isQuotaReached()).toBe(false)
  })

  it('tells subscribers once, not on every repeated failure', () => {
    const seen = vi.fn()
    subscribeQuota(seen)
    markQuotaReached()
    markQuotaReached()
    expect(seen).toHaveBeenCalledTimes(1)
  })
})
