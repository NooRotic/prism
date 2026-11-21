import { beforeEach, describe, expect, it } from 'vitest'
import { checkAllowed, CHECKS_PER_DAY, COOLDOWN_MS, recordCheck } from '../youtubeLiveBudget'

const HOUR = 60 * 60 * 1000
const T0 = Date.UTC(2026, 10, 21, 12, 0, 0)

beforeEach(() => localStorage.clear())

describe('youtubeLiveBudget', () => {
  it('allows the first check', () => {
    expect(checkAllowed(T0)).toEqual({ ok: true })
  })

  it('makes the viewer wait an hour after a check', () => {
    recordCheck(T0)
    const r = checkAllowed(T0 + 10 * 60 * 1000)
    expect(r).toEqual({ ok: false, reason: 'cooldown', retryAt: T0 + COOLDOWN_MS })
    expect(checkAllowed(T0 + COOLDOWN_MS)).toEqual({ ok: true })
  })

  it('allows five checks in a rolling 24 hours, then names when the oldest one drops out', () => {
    for (let i = 0; i < CHECKS_PER_DAY; i++) recordCheck(T0 + i * HOUR)
    const now = T0 + CHECKS_PER_DAY * HOUR + 5 * 60 * 1000
    expect(checkAllowed(now)).toEqual({ ok: false, reason: 'daily', retryAt: T0 + 24 * HOUR })
    expect(checkAllowed(T0 + 24 * HOUR)).toEqual({ ok: true })
  })

  it('does not count a check older than 24 hours', () => {
    recordCheck(T0)
    expect(checkAllowed(T0 + 25 * HOUR)).toEqual({ ok: true })
  })

  it('reads damaged storage as no checks', () => {
    localStorage.setItem('prism_youtube_live_checks', '{"not":"a list"}')
    expect(checkAllowed(T0)).toEqual({ ok: true })
    localStorage.setItem('prism_youtube_live_checks', JSON.stringify(['x', null, 5, T0]))
    expect(checkAllowed(T0 + 1000).ok).toBe(false)
  })
})
