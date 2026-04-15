import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCallbackRefs } from '../useCallbackRefs'

describe('useCallbackRefs', () => {
  it('returns a ref whose .current reflects the initial values', () => {
    const onReady = vi.fn()
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useCallbackRefs({ onReady, onError }),
    )

    expect(result.current.current.onReady).toBe(onReady)
    expect(result.current.current.onError).toBe(onError)
  })

  it('updates .current when callback props change', () => {
    const firstReady = vi.fn()
    const secondReady = vi.fn()

    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useCallbackRefs({ onReady: cb }),
      { initialProps: { cb: firstReady } },
    )

    expect(result.current.current.onReady).toBe(firstReady)

    rerender({ cb: secondReady })

    expect(result.current.current.onReady).toBe(secondReady)
  })

  it('returns the same ref object identity across renders', () => {
    const cb = vi.fn()

    const { result, rerender } = renderHook(() =>
      useCallbackRefs({ onReady: cb }),
    )
    const firstRefIdentity = result.current

    rerender()
    rerender()
    rerender()

    // The ref itself is stable — same object across renders, so
    // including it in a useEffect dep array is a no-op.
    expect(result.current).toBe(firstRefIdentity)
  })

  it('handles undefined callbacks without crashing', () => {
    const { result } = renderHook(() =>
      useCallbackRefs({
        onReady: undefined,
        onError: undefined,
      }),
    )

    expect(result.current.current.onReady).toBeUndefined()
    expect(result.current.current.onError).toBeUndefined()
  })

  it('lets event handlers read latest values via ref without re-registration', () => {
    // Simulates how VideoJSPlayer uses the hook: stash the ref in a
    // long-lived handler, then verify the handler sees the latest
    // callback without any re-registration.
    const firstReady = vi.fn()
    const secondReady = vi.fn()

    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useCallbackRefs({ onReady: cb }),
      { initialProps: { cb: firstReady } },
    )

    // Capture a handler closure that reads through the ref. This
    // handler is "registered once" — the caller would typically put
    // it inside a useEffect that doesn't re-run.
    const refAtRegistration = result.current
    const longLivedHandler = () => {
      refAtRegistration.current.onReady?.()
    }

    longLivedHandler()
    expect(firstReady).toHaveBeenCalledTimes(1)
    expect(secondReady).not.toHaveBeenCalled()

    // Re-render with a NEW callback reference. The handler didn't
    // change — but on the next invocation it sees the new callback.
    rerender({ cb: secondReady })
    longLivedHandler()
    expect(firstReady).toHaveBeenCalledTimes(1)
    expect(secondReady).toHaveBeenCalledTimes(1)
  })
})
