import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useFillMode } from '../useFillMode'
import { STORAGE_KEYS } from '../../../config/storageKeys'

const KEY = STORAGE_KEYS.LOCAL_FILL_MODE

describe('useFillMode', () => {
  beforeEach(() => localStorage.clear())

  it('is off by default', () => {
    const { result } = renderHook(() => useFillMode())
    expect(result.current.fill).toBe(false)
  })

  it('reads a stored true', () => {
    localStorage.setItem(KEY, 'true')
    const { result } = renderHook(() => useFillMode())
    expect(result.current.fill).toBe(true)
  })

  it('treats a garbage stored value as off', () => {
    localStorage.setItem(KEY, 'banana')
    const { result } = renderHook(() => useFillMode())
    expect(result.current.fill).toBe(false)
  })

  it('toggleFill flips and saves true and false', () => {
    const { result } = renderHook(() => useFillMode())

    act(() => result.current.toggleFill())
    expect(result.current.fill).toBe(true)
    expect(localStorage.getItem(KEY)).toBe('true')

    act(() => result.current.toggleFill())
    expect(result.current.fill).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('false')
  })

  it('setFill sets it explicitly and saves it', () => {
    const { result } = renderHook(() => useFillMode())

    act(() => result.current.setFill(true))
    expect(result.current.fill).toBe(true)
    expect(localStorage.getItem(KEY)).toBe('true')

    act(() => result.current.setFill(false))
    expect(result.current.fill).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('false')
  })

  it('survives a reload', () => {
    const first = renderHook(() => useFillMode())
    act(() => first.result.current.setFill(true))
    first.unmount()

    const second = renderHook(() => useFillMode())
    expect(second.result.current.fill).toBe(true)
  })

  it('still flips for the session when localStorage.setItem throws', () => {
    const { result } = renderHook(() => useFillMode())
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    act(() => {
      expect(() => result.current.toggleFill()).not.toThrow()
    })
    expect(result.current.fill).toBe(true)

    spy.mockRestore()
  })

  it('still reads as off when localStorage.getItem throws', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })

    const { result } = renderHook(() => useFillMode())
    expect(result.current.fill).toBe(false)

    spy.mockRestore()
  })
})
