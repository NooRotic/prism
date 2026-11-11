import { act, renderHook } from '@testing-library/react'
import { useWallCap } from '../useWallCap'

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

describe('useWallCap', () => {
  const original = window.innerWidth

  afterEach(() => setWidth(original))

  it('allows eight tiles at 1024px and wider and six below', () => {
    setWidth(1280)
    expect(renderHook(() => useWallCap()).result.current).toBe(8)

    setWidth(1024)
    expect(renderHook(() => useWallCap()).result.current).toBe(8)

    setWidth(800)
    expect(renderHook(() => useWallCap()).result.current).toBe(6)
  })

  it('follows the window as it is resized', () => {
    setWidth(1280)
    const { result } = renderHook(() => useWallCap())
    expect(result.current).toBe(8)

    act(() => {
      setWidth(500)
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toBe(6)
  })
})
