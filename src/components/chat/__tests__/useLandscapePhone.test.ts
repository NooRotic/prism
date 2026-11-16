import { act, renderHook } from '@testing-library/react'
import { LANDSCAPE_PHONE_QUERY } from '../landscapePhone'
import { useLandscapePhone } from '../useLandscapePhone'

// jsdom cannot evaluate a media query and the test setup fixes matchMedia at `false`,
// so each test installs a fake it controls.
function installMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  const asked: string[] = []
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      asked.push(query)
      return {
        get matches() {
          return matches
        },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }
    }),
  )
  return {
    asked,
    change(next: boolean) {
      matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

describe('useLandscapePhone', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false when the query does not match', () => {
    installMatchMedia(false)
    expect(renderHook(() => useLandscapePhone()).result.current).toBe(false)
  })

  it('is true when it matches', () => {
    installMatchMedia(true)
    expect(renderHook(() => useLandscapePhone()).result.current).toBe(true)
  })

  it('follows a change event without remounting', () => {
    const media = installMatchMedia(false)
    const { result } = renderHook(() => useLandscapePhone())
    act(() => media.change(true))
    expect(result.current).toBe(true)
    act(() => media.change(false))
    expect(result.current).toBe(false)
  })

  it('asks matchMedia for exactly LANDSCAPE_PHONE_QUERY', () => {
    const media = installMatchMedia(false)
    renderHook(() => useLandscapePhone())
    expect(media.asked.length).toBeGreaterThan(0)
    expect(new Set(media.asked)).toEqual(new Set([LANDSCAPE_PHONE_QUERY]))
    expect(LANDSCAPE_PHONE_QUERY).toBe('(orientation: landscape) and (max-height: 500px)')
  })

  it('is false when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => useLandscapePhone()).result.current).toBe(false)
  })
})
