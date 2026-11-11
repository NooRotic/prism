import { DASHBOARD_BG, contrastRatio, ensureContrast } from '../contrast'

describe('contrastRatio', () => {
  it('is 21 for white on black and 1 for a colour on itself', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5)
  })

  it('does not depend on which colour is the foreground', () => {
    expect(contrastRatio('#9146FF', DASHBOARD_BG)).toBeCloseTo(contrastRatio(DASHBOARD_BG, '#9146FF') as number, 5)
  })

  it.each(['red', '#fff', '', '#12345', '#GGGGGG'])('gives null for %j', (bad) => {
    expect(contrastRatio(bad, '#000000')).toBeNull()
    expect(contrastRatio('#000000', bad)).toBeNull()
  })
})

describe('ensureContrast', () => {
  it('returns a colour that already passes unchanged', () => {
    expect(ensureContrast('#FFFFFF')).toBe('#FFFFFF')
  })

  it.each(['#000000', '#9146FF', '#0000FF', '#1A1A2E'])('lightens %s until it reaches 4.5:1 on the dashboard background', (color) => {
    const result = ensureContrast(color) as string

    expect(result).not.toBe(color)
    expect(contrastRatio(result, DASHBOARD_BG) as number).toBeGreaterThanOrEqual(4.5)
  })

  it('accepts lower-case hex', () => {
    expect(ensureContrast('#ffffff')).toBe('#ffffff')
    expect(contrastRatio(ensureContrast('#9146ff') as string, DASHBOARD_BG) as number).toBeGreaterThanOrEqual(4.5)
  })

  it('honours another background and another minimum', () => {
    const result = ensureContrast('#777777', '#000000', 7) as string

    expect(contrastRatio(result, '#000000') as number).toBeGreaterThanOrEqual(7)
  })

  it.each(['red', '#fff', ''])('gives null for an invalid colour %j', (bad) => {
    expect(ensureContrast(bad)).toBeNull()
  })
})
