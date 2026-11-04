import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useFullscreen } from '../useFullscreen'

// jsdom has no Fullscreen API, so each test stubs exactly what it needs.
const setFullscreenElement = (el: Element | null) =>
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => el })

const fireChange = () =>
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'))
  })

function supportFullscreen() {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
  const request = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: request,
  })
  const exit = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit })
  return { request, exit }
}

describe('useFullscreen', () => {
  let row: HTMLDivElement
  let ref: { current: HTMLDivElement | null }

  beforeEach(() => {
    row = document.createElement('div')
    document.body.appendChild(row)
    ref = { current: row }
    setFullscreenElement(null)
  })

  afterEach(() => {
    row.remove()
    Reflect.deleteProperty(document, 'fullscreenElement')
    Reflect.deleteProperty(document, 'fullscreenEnabled')
    Reflect.deleteProperty(document, 'exitFullscreen')
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
    vi.restoreAllMocks()
  })

  it('reports unsupported, and toggling does nothing and does not throw, when the API is missing', () => {
    const { result } = renderHook(() => useFullscreen(ref))

    expect(result.current.supported).toBe(false)
    expect(() => act(() => result.current.toggle())).not.toThrow()
    expect(result.current.isFullscreen).toBe(false)
  })

  it('reports unsupported when the browser says fullscreen is not enabled', () => {
    supportFullscreen()
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false })

    const { result } = renderHook(() => useFullscreen(ref))

    expect(result.current.supported).toBe(false)
  })

  it('reports supported when the API exists', () => {
    supportFullscreen()
    const { result } = renderHook(() => useFullscreen(ref))
    expect(result.current.supported).toBe(true)
  })

  it('toggle asks the row, not the page or an iframe, to go fullscreen', () => {
    const { request } = supportFullscreen()
    const { result } = renderHook(() => useFullscreen(ref))

    act(() => result.current.toggle())

    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.contexts[0]).toBe(row)
  })

  it('a rejected request changes nothing and does not throw', async () => {
    const { request } = supportFullscreen()
    request.mockRejectedValue(new Error('Permissions check failed'))
    const { result } = renderHook(() => useFullscreen(ref))

    await act(async () => {
      result.current.toggle()
      await Promise.resolve()
    })

    expect(result.current.isFullscreen).toBe(false)
  })

  it('a request that throws synchronously changes nothing and does not throw', () => {
    const { request } = supportFullscreen()
    request.mockImplementation(() => {
      throw new TypeError('not allowed')
    })
    const { result } = renderHook(() => useFullscreen(ref))

    expect(() => act(() => result.current.toggle())).not.toThrow()
    expect(result.current.isFullscreen).toBe(false)
  })

  it('isFullscreen is true when fullscreenchange finds the row fullscreen', () => {
    supportFullscreen()
    const { result } = renderHook(() => useFullscreen(ref))

    setFullscreenElement(row)
    fireChange()

    expect(result.current.isFullscreen).toBe(true)
  })

  it("does not flip when another element, such as Twitch's player iframe, goes fullscreen", () => {
    supportFullscreen()
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const { result } = renderHook(() => useFullscreen(ref))

    setFullscreenElement(row)
    fireChange()
    expect(result.current.isFullscreen).toBe(true)

    setFullscreenElement(iframe)
    fireChange()
    expect(result.current.isFullscreen).toBe(false)

    iframe.remove()
  })

  it('stays off when something else is fullscreen from the start', () => {
    supportFullscreen()
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const { result } = renderHook(() => useFullscreen(ref))

    setFullscreenElement(iframe)
    fireChange()

    expect(result.current.isFullscreen).toBe(false)
    iframe.remove()
  })

  it('clears when fullscreen ends', () => {
    supportFullscreen()
    const { result } = renderHook(() => useFullscreen(ref))
    setFullscreenElement(row)
    fireChange()
    expect(result.current.isFullscreen).toBe(true)

    setFullscreenElement(null)
    fireChange()

    expect(result.current.isFullscreen).toBe(false)
  })

  it('toggle while the row is fullscreen exits instead of requesting again', () => {
    const { request, exit } = supportFullscreen()
    const { result } = renderHook(() => useFullscreen(ref))
    setFullscreenElement(row)
    fireChange()

    act(() => result.current.toggle())

    expect(exit).toHaveBeenCalledOnce()
    expect(request).not.toHaveBeenCalled()
  })

  it('toggle does nothing when there is no row yet', () => {
    const { request } = supportFullscreen()
    ref.current = null
    const { result } = renderHook(() => useFullscreen(ref))

    expect(() => act(() => result.current.toggle())).not.toThrow()
    expect(request).not.toHaveBeenCalled()
  })

  it('stops listening when it unmounts', () => {
    supportFullscreen()
    const remove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useFullscreen(ref))

    unmount()

    expect(remove).toHaveBeenCalledWith('fullscreenchange', expect.any(Function))
  })
})
