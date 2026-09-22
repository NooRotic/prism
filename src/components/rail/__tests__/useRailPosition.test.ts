import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { useRailPosition } from '../useRailPosition'
import { STORAGE_KEYS } from '../../../config/storageKeys'

describe('useRailPosition', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to left when nothing is stored', () => {
    const { result } = renderHook(() => useRailPosition())
    expect(result.current.position).toBe('left')
  })

  it('reads a stored position', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, 'left')
    const { result } = renderHook(() => useRailPosition())
    expect(result.current.position).toBe('left')
  })

  it('flips left and right, persisting each flip', () => {
    const { result } = renderHook(() => useRailPosition())

    act(() => result.current.flip())
    expect(result.current.position).toBe('right')
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_RAIL_POSITION)).toBe('right')

    act(() => result.current.flip())
    expect(result.current.position).toBe('left')
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_RAIL_POSITION)).toBe('left')
  })

  it('survives a reload', () => {
    const first = renderHook(() => useRailPosition())
    act(() => first.result.current.flip())
    first.unmount()

    const second = renderHook(() => useRailPosition())
    expect(second.result.current.position).toBe('right')
  })

  it('falls back to the default for an unimplemented stored position', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, 'top')
    const { result } = renderHook(() => useRailPosition())
    expect(result.current.position).toBe('left')
  })

  it('falls back to the default for a garbage stored value', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, 'sideways')
    const { result } = renderHook(() => useRailPosition())
    expect(result.current.position).toBe('left')
  })

  it('flips state even when localStorage.setItem throws (quota exceeded)', () => {
    const { result } = renderHook(() => useRailPosition())
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    act(() => {
      expect(() => result.current.flip()).not.toThrow()
    })
    expect(result.current.position).toBe('right')

    spy.mockRestore()
  })
})
