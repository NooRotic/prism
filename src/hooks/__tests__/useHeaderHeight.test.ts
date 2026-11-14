import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHeaderHeight } from '../useHeaderHeight'

class FakeObserver {
  static last: FakeObserver | null = null
  callback: () => void
  disconnected = false
  observe = vi.fn()
  constructor(callback: () => void) {
    this.callback = callback
    FakeObserver.last = this
  }
  disconnect() {
    this.disconnected = true
  }
}

const read = () => document.documentElement.style.getPropertyValue('--header-height')

function header(height: number) {
  const el = document.createElement('header')
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => height })
  return el
}

beforeEach(() => {
  FakeObserver.last = null
  vi.stubGlobal('ResizeObserver', FakeObserver)
  document.documentElement.style.removeProperty('--header-height')
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--header-height')
})

describe('useHeaderHeight', () => {
  it('publishes the header’s height as --header-height at once, follows it when it resizes, and gives the default back on unmount', () => {
    const el = header(56)
    const { unmount } = renderHook(() => useHeaderHeight({ current: el }))
    expect(read()).toBe('56px')
    expect(FakeObserver.last?.observe).toHaveBeenCalledWith(el)

    Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => 96 })
    FakeObserver.last?.callback()
    expect(read()).toBe('96px')

    unmount()
    expect(read()).toBe('')
    expect(FakeObserver.last?.disconnected).toBe(true)
  })

  it('also follows a window resize, and stops listening on unmount (a page that is not being painted gets no observer calls)', () => {
    const el = header(56)
    const { unmount } = renderHook(() => useHeaderHeight({ current: el }))

    Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => 90 })
    window.dispatchEvent(new Event('resize'))
    expect(read()).toBe('90px')

    unmount()
    Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => 120 })
    window.dispatchEvent(new Event('resize'))
    expect(read()).toBe('')
  })

  it('publishes it once when the browser has no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)

    const { unmount } = renderHook(() => useHeaderHeight({ current: header(72) }))

    expect(read()).toBe('72px')
    unmount()
    expect(read()).toBe('')
  })

  it('leaves --header-height alone for a header with no height (not displayed), and for no header at all', () => {
    renderHook(() => useHeaderHeight({ current: header(0) }))
    expect(read()).toBe('')

    renderHook(() => useHeaderHeight({ current: null }))
    expect(read()).toBe('')
  })
})
