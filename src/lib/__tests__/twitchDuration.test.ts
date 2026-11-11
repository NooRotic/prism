import { parseTwitchDuration } from '../twitchDuration'

describe('parseTwitchDuration', () => {
  it.each([
    ['1h2m3s', 1 + 2 / 60 + 3 / 3600],
    ['2h', 2],
    ['45m', 0.75],
    ['30s', 30 / 3600],
    ['10h0m0s', 10],
    ['', 0],
  ])('reads %j as %d hours', (input, hours) => {
    expect(parseTwitchDuration(input)).toBeCloseTo(hours, 10)
  })

  it('reads text it does not understand as zero', () => {
    expect(parseTwitchDuration('soon')).toBe(0)
  })
})
