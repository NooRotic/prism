import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useChatScale } from '../useChatScale'
import { STORAGE_KEYS } from '../../../config/storageKeys'

const KEY = STORAGE_KEYS.LOCAL_CHAT_SCALE

// A storage event only ever reaches OTHER windows, which is how the pop-out and
// the main window keep one size.
const storageEvent = (key: string | null, newValue: string | null) =>
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
  })

describe('useChatScale', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('defaults to 100%', () => {
    const { result } = renderHook(() => useChatScale())
    expect(result.current.scale).toBe(1)
  })

  it('reads a saved size', () => {
    localStorage.setItem(KEY, '1.5')
    const { result } = renderHook(() => useChatScale())
    expect(result.current.scale).toBe(1.5)
  })

  it('treats a garbage saved size as 100%', () => {
    localStorage.setItem(KEY, 'huge')
    const { result } = renderHook(() => useChatScale())
    expect(result.current.scale).toBe(1)
  })

  it('treats an out-of-range saved size as 100%', () => {
    localStorage.setItem(KEY, '9')
    const { result } = renderHook(() => useChatScale())
    expect(result.current.scale).toBe(1)
  })

  it('larger and smaller move one step and save it', () => {
    const { result } = renderHook(() => useChatScale())

    act(() => result.current.larger())
    expect(result.current.scale).toBe(1.15)
    expect(localStorage.getItem(KEY)).toBe('1.15')

    act(() => result.current.smaller())
    act(() => result.current.smaller())
    expect(result.current.scale).toBe(0.85)
    expect(localStorage.getItem(KEY)).toBe('0.85')
  })

  it('reset goes back to 100% and saves it', () => {
    localStorage.setItem(KEY, '1.75')
    const { result } = renderHook(() => useChatScale())

    act(() => result.current.reset())

    expect(result.current.scale).toBe(1)
    expect(localStorage.getItem(KEY)).toBe('1')
  })

  it('cannot go below the smallest or above the largest step', () => {
    const { result } = renderHook(() => useChatScale())

    for (let i = 0; i < 10; i++) act(() => result.current.larger())
    expect(result.current.scale).toBe(2)
    expect(result.current.canLarger).toBe(false)
    expect(result.current.canSmaller).toBe(true)

    for (let i = 0; i < 10; i++) act(() => result.current.smaller())
    expect(result.current.scale).toBe(0.7)
    expect(result.current.canSmaller).toBe(false)
    expect(result.current.canLarger).toBe(true)
  })

  it('follows a storage event for its key, as a change made in another window', () => {
    const { result } = renderHook(() => useChatScale())

    storageEvent(KEY, '1.5')

    expect(result.current.scale).toBe(1.5)
  })

  it('ignores a storage event for another key', () => {
    const { result } = renderHook(() => useChatScale())

    storageEvent('prism_something_else', '1.5')

    expect(result.current.scale).toBe(1)
  })

  it('ignores garbage from another window by falling back to 100%', () => {
    localStorage.setItem(KEY, '1.5')
    const { result } = renderHook(() => useChatScale())

    storageEvent(KEY, 'banana')

    expect(result.current.scale).toBe(1)
  })

  it('goes back to 100% when the key is removed or storage is cleared elsewhere', () => {
    localStorage.setItem(KEY, '1.5')
    const { result } = renderHook(() => useChatScale())

    storageEvent(KEY, null)
    expect(result.current.scale).toBe(1)

    storageEvent(KEY, '2')
    expect(result.current.scale).toBe(2)
    storageEvent(null, null)
    expect(result.current.scale).toBe(1)
  })

  it('still changes for the session when localStorage.setItem throws', () => {
    const { result } = renderHook(() => useChatScale())
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    act(() => {
      expect(() => result.current.larger()).not.toThrow()
    })

    expect(result.current.scale).toBe(1.15)
  })

  it('still reads 100% when localStorage.getItem throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })

    const { result } = renderHook(() => useChatScale())

    expect(result.current.scale).toBe(1)
  })

  it('stops listening when it unmounts', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useChatScale())

    unmount()

    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function))
  })
})
