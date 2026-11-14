import { regionName } from '../countries'

describe('regionName', () => {
  it('names a known code in English, whatever its case', () => {
    expect(regionName('us')).toBe('United States')
    expect(regionName('GB')).toBe('United Kingdom')
    expect(regionName('sn')).toBe('Senegal')
  })

  it('falls back to the upper-case code for a code nobody knows', () => {
    expect(regionName('zz')).toBe('ZZ')
    expect(regionName('xx')).toBe('XX')
  })

  it('gives an empty string for no country', () => {
    expect(regionName(null)).toBe('')
    expect(regionName('')).toBe('')
  })

  it('falls back to the code when the browser cannot name regions at all', () => {
    const original = Intl.DisplayNames
    // A browser without Intl.DisplayNames: `new undefined(...)` throws.
    Object.defineProperty(Intl, 'DisplayNames', { value: undefined, configurable: true, writable: true })
    try {
      expect(regionName('fr')).toBe('FR')
    } finally {
      Object.defineProperty(Intl, 'DisplayNames', { value: original, configurable: true, writable: true })
    }
  })
})
