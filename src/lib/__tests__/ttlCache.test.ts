import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ttlGet, ttlSet } from '../ttlCache'

beforeEach(() => localStorage.clear())

describe('ttlCache', () => {
  it('returns a value set within its TTL', () => {
    ttlSet('k', { a: 1 }, 1000)
    expect(ttlGet('k', 500, 1200)).toEqual({ a: 1 })
  })
  it('returns null once the TTL has passed', () => {
    ttlSet('k', 'v', 1000)
    expect(ttlGet('k', 500, 1600)).toBeNull()
  })
  it('returns null for corrupt storage', () => {
    localStorage.setItem('k', '{not json')
    expect(ttlGet('k', 500)).toBeNull()
  })
  it('does not throw when storage refuses a write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => ttlSet('k', 'v')).not.toThrow()
    spy.mockRestore()
  })
})
