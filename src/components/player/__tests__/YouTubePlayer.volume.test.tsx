import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import YouTubePlayer from '../YouTubePlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'
import { readSavedVolume, saveVolume } from '../../../lib/playerVolume'

// react-player is replaced by a stub that keeps the props the component hands it.
const rp = vi.hoisted(() => ({ props: {} as Record<string, unknown> }))
vi.mock('react-player', () => ({
  default: (props: Record<string, unknown>) => {
    rp.props = props
    return null
  },
}))

const yt = 'https://www.youtube.com/watch?v=abc'
const detection = { type: 'youtube', originalUrl: yt, playableUrl: yt } as unknown as URLDetectionResult
const fromElement = (volume: number) => ({ currentTarget: { volume } })

describe('YouTubePlayer saved volume', () => {
  beforeEach(() => {
    localStorage.clear()
    rp.props = {}
  })
  afterEach(cleanup)

  it('passes the saved volume on and keeps the muted start', () => {
    saveVolume(0.2)
    render(<YouTubePlayer url={yt} detection={detection} />)
    expect(rp.props.volume).toBe(0.2)
    expect(rp.props.muted).toBe(true)
  })

  it('passes no volume when none is saved', () => {
    render(<YouTubePlayer url={yt} detection={detection} />)
    expect(rp.props.volume).toBeUndefined()
  })

  it('saves a volume change only once playback has begun', () => {
    saveVolume(0.2)
    render(<YouTubePlayer url={yt} detection={detection} />)
    const change = rp.props.onVolumeChange as (e: unknown) => void
    change(fromElement(1))
    expect(readSavedVolume()).toBe(0.2)
    ;(rp.props.onPlay as () => void)()
    change(fromElement(0.7))
    expect(readSavedVolume()).toBe(0.7)
  })
})

const fromMuteChange = (muted: boolean, volume = 0.5) => ({ currentTarget: { volume, muted } })
const setActivation = (hasBeenActive: boolean | undefined) => {
  Object.defineProperty(navigator, 'userActivation', { value: hasBeenActive === undefined ? undefined : { hasBeenActive }, configurable: true })
}

describe('YouTubePlayer mute', () => {
  beforeEach(() => {
    localStorage.clear()
    rp.props = {}
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    setActivation(undefined)
  })

  it('starts muted when the visitor has not interacted with the page yet (the browser would block sound)', () => {
    setActivation(false)
    render(<YouTubePlayer url={yt} detection={detection} />)
    expect(rp.props.muted).toBe(true)
  })

  it('starts with sound when the visitor has already interacted with the page (they clicked to get here)', () => {
    setActivation(true)
    render(<YouTubePlayer url={yt} detection={detection} />)
    expect(rp.props.muted).toBe(false)
  })

  it('starts with sound in a frame whose parent window the visitor has clicked (the floating window Click to enable sound button)', () => {
    setActivation(false)
    const spy = vi.spyOn(window, 'parent', 'get').mockReturnValue({ navigator: { userActivation: { hasBeenActive: true } } } as unknown as Window)
    render(<YouTubePlayer url={yt} detection={detection} />)
    expect(rp.props.muted).toBe(false)
    spy.mockRestore()
  })

  it('starts muted in a frame whose parent window has not been clicked, and when the parent cannot be read (another origin)', () => {
    setActivation(false)
    const unclicked = vi.spyOn(window, 'parent', 'get').mockReturnValue({ navigator: { userActivation: { hasBeenActive: false } } } as unknown as Window)
    const first = render(<YouTubePlayer url={yt} detection={detection} />)
    expect(rp.props.muted).toBe(true)
    first.unmount()
    unclicked.mockRestore()
    const unreadable = vi.spyOn(window, 'parent', 'get').mockReturnValue(new Proxy({}, { get() { throw new DOMException('Blocked a frame', 'SecurityError') } }) as unknown as Window)
    render(<YouTubePlayer url={yt} detection={detection} />)
    expect(rp.props.muted).toBe(true)
    unreadable.mockRestore()
  })

  it('follows the viewer: once they unmute, it stays unmuted through later re-renders (it used to mute them again)', () => {
    setActivation(false)
    const { rerender } = render(<YouTubePlayer url={yt} detection={detection} />)
    act(() => (rp.props.onPlay as () => void)())
    act(() => (rp.props.onVolumeChange as (e: unknown) => void)(fromMuteChange(false)))
    expect(rp.props.muted).toBe(false)
    rerender(<YouTubePlayer url={yt} detection={detection} />)
    rerender(<YouTubePlayer url={yt} detection={detection} />)
    expect(rp.props.muted).toBe(false)
  })

  it('follows the viewer muting again', () => {
    setActivation(true)
    render(<YouTubePlayer url={yt} detection={detection} />)
    act(() => (rp.props.onPlay as () => void)())
    act(() => (rp.props.onVolumeChange as (e: unknown) => void)(fromMuteChange(true)))
    expect(rp.props.muted).toBe(true)
  })

  it('ignores a mute report from before playback began (the element reports its own defaults first)', () => {
    setActivation(true)
    render(<YouTubePlayer url={yt} detection={detection} />)
    act(() => (rp.props.onVolumeChange as (e: unknown) => void)(fromMuteChange(true)))
    expect(rp.props.muted).toBe(false)
  })

  it('goes back to a muted start when sound autoplay is blocked (nothing plays within 3 seconds)', () => {
    setActivation(true)
    render(<YouTubePlayer url={yt} detection={detection} />)
    expect(rp.props.muted).toBe(false)
    act(() => {
      vi.advanceTimersByTime(3100)
    })
    expect(rp.props.muted).toBe(true)
  })

  it('does not do that once it is playing', () => {
    setActivation(true)
    render(<YouTubePlayer url={yt} detection={detection} />)
    act(() => (rp.props.onPlay as () => void)())
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(rp.props.muted).toBe(false)
  })
})
