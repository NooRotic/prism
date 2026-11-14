import { act, renderHook } from '@testing-library/react'
import { useAutoFold } from '../useAutoFold'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  vi.useRealTimers()
})

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('useAutoFold while held', () => {
  it('does not fold while held, and folds thirty seconds after the hold ends', () => {
    const { result, rerender } = renderHook(({ hold }) => useAutoFold('a', 30_000, hold), { initialProps: { hold: true } })

    tick(120_000)
    expect(result.current.open).toBe(true)

    rerender({ hold: false })
    tick(29_999)
    expect(result.current.open).toBe(true)
    tick(1)
    expect(result.current.open).toBe(false)
  })

  it('opens a folded panel when a hold starts', () => {
    const { result, rerender } = renderHook(({ hold }) => useAutoFold('a', 30_000, hold), { initialProps: { hold: false } })
    tick(30_000)
    expect(result.current.open).toBe(false)

    rerender({ hold: true })

    expect(result.current.open).toBe(true)
    tick(120_000)
    expect(result.current.open).toBe(true)
  })
})

describe('useAutoFold', () => {
  it('is open at first and folds after thirty seconds', () => {
    const { result } = renderHook(() => useAutoFold('a'))
    expect(result.current.open).toBe(true)

    tick(29_999)
    expect(result.current.open).toBe(true)

    tick(1)
    expect(result.current.open).toBe(false)
  })

  it('takes its own delay', () => {
    const { result } = renderHook(() => useAutoFold('a', 5_000))

    tick(4_999)
    expect(result.current.open).toBe(true)
    tick(1)
    expect(result.current.open).toBe(false)
  })

  it('bump starts the thirty seconds again', () => {
    const { result } = renderHook(() => useAutoFold('a'))

    tick(20_000)
    act(() => result.current.bump())
    tick(29_999)
    expect(result.current.open).toBe(true)

    tick(1)
    expect(result.current.open).toBe(false)
  })

  it('opens again, with a fresh thirty seconds, when the key changes', () => {
    const { result, rerender } = renderHook(({ k }) => useAutoFold(k), { initialProps: { k: 'a' } })
    tick(30_000)
    expect(result.current.open).toBe(false)

    rerender({ k: 'b' })
    expect(result.current.open).toBe(true)

    tick(29_999)
    expect(result.current.open).toBe(true)
    tick(1)
    expect(result.current.open).toBe(false)
  })

  it('a new key in the middle of the countdown starts the countdown over', () => {
    const { result, rerender } = renderHook(({ k }) => useAutoFold(k), { initialProps: { k: 'a' } })

    tick(25_000)
    rerender({ k: 'b' })
    tick(25_000)

    expect(result.current.open).toBe(true)
  })

  it('a pinned panel never folds, and unpinning starts the countdown', () => {
    const { result } = renderHook(() => useAutoFold('a'))

    act(() => result.current.togglePin())
    expect(result.current.pinned).toBe(true)
    tick(120_000)
    expect(result.current.open).toBe(true)

    act(() => result.current.togglePin())
    expect(result.current.pinned).toBe(false)
    tick(29_999)
    expect(result.current.open).toBe(true)
    tick(1)
    expect(result.current.open).toBe(false)
  })

  it('stays pinned when a new stream starts', () => {
    const { result, rerender } = renderHook(({ k }) => useAutoFold(k), { initialProps: { k: 'a' } })
    act(() => result.current.togglePin())

    rerender({ k: 'b' })
    tick(120_000)

    expect(result.current.pinned).toBe(true)
    expect(result.current.open).toBe(true)
  })

  it('reopen brings a folded panel back for another thirty seconds', () => {
    const { result } = renderHook(() => useAutoFold('a'))
    tick(30_000)
    expect(result.current.open).toBe(false)

    act(() => result.current.reopen())
    expect(result.current.open).toBe(true)

    tick(29_999)
    expect(result.current.open).toBe(true)
    tick(1)
    expect(result.current.open).toBe(false)
  })

  it('does not count down while the page is hidden, and starts again when it comes back', () => {
    const { result } = renderHook(() => useAutoFold('a'))

    tick(10_000)
    act(() => setHidden(true))
    tick(10 * 60_000)
    expect(result.current.open).toBe(true)

    act(() => setHidden(false))
    tick(29_999)
    expect(result.current.open).toBe(true)
    tick(1)
    expect(result.current.open).toBe(false)
  })

  it('keeps no timer after it is unmounted', () => {
    const { unmount } = renderHook(() => useAutoFold('a'))

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives the same functions on every render, so a component can depend on them', () => {
    const { result, rerender } = renderHook(() => useAutoFold('a'))
    const first = result.current

    rerender()

    expect(result.current.bump).toBe(first.bump)
    expect(result.current.reopen).toBe(first.reopen)
    expect(result.current.togglePin).toBe(first.togglePin)
  })
})
