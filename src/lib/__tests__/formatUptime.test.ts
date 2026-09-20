import { formatUptime } from '../formatUptime'

describe('formatUptime', () => {
  it('formats zero as 0:00:00', () => {
    expect(formatUptime(0)).toBe('0:00:00')
  })

  it('pads minutes and seconds', () => {
    expect(formatUptime(65_000)).toBe('0:01:05')
  })

  it('formats hours without padding', () => {
    expect(formatUptime(4 * 3600_000 + 35 * 60_000 + 18_000)).toBe('4:35:18')
  })

  it('lets hours run past 24 rather than rolling over to days', () => {
    expect(formatUptime(30 * 3600_000 + 33 * 60_000 + 46_000)).toBe('30:33:46')
  })

  it('clamps negative elapsed time to zero', () => {
    expect(formatUptime(-5000)).toBe('0:00:00')
  })
})
