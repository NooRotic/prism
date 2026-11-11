import { formatAxisDate, formatHours, formatRank, formatSigned, formatWhole, trimHours } from '../streamerFormat'

describe('trimHours', () => {
  it('writes hours to one decimal without a trailing .0', () => {
    expect(trimHours(41)).toBe('41')
    expect(trimHours(41.5)).toBe('41.5')
    expect(trimHours(12.54)).toBe('12.5')
    expect(trimHours(0.04)).toBe('0')
  })
})

describe('formatRank', () => {
  it('writes a hash and a thousands separator', () => {
    expect(formatRank(18402)).toBe('#18,402')
    expect(formatRank(7)).toBe('#7')
  })
})

describe('formatWhole', () => {
  it('rounds and groups thousands', () => {
    expect(formatWhole(1284)).toBe('1,284')
    expect(formatWhole(1226.4)).toBe('1,226')
    expect(formatWhole(86)).toBe('86')
  })
})

describe('formatSigned', () => {
  it('always shows the sign, with zero as +0', () => {
    expect(formatSigned(96)).toBe('+96')
    expect(formatSigned(-12)).toBe('-12')
    expect(formatSigned(0)).toBe('+0')
    expect(formatSigned(-0)).toBe('+0')
  })

  it('rounds and groups thousands', () => {
    expect(formatSigned(13874)).toBe('+13,874')
    expect(formatSigned(95.6)).toBe('+96')
    expect(formatSigned(-1500)).toBe('-1,500')
  })
})

describe('formatHours', () => {
  it('shows whole hours plainly and others with one decimal', () => {
    expect(formatHours(41)).toBe('41h')
    expect(formatHours(41.5)).toBe('41.5h')
    expect(formatHours(652 / 60)).toBe('10.9h')
  })

  it('shows less than a tenth of an hour as 0h', () => {
    expect(formatHours(0)).toBe('0h')
    expect(formatHours(0.04)).toBe('0h')
  })
})

describe('formatAxisDate', () => {
  it('writes the local month and day in English', () => {
    expect(formatAxisDate(new Date(2026, 9, 11, 0, 0, 0).getTime())).toBe('Oct 11')
    expect(formatAxisDate(new Date(2026, 10, 1, 23, 59, 0).getTime())).toBe('Nov 1')
  })
})
