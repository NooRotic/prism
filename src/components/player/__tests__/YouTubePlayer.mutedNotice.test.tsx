import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import YouTubePlayer from '../YouTubePlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'

const rp = vi.hoisted(() => ({ props: {} as Record<string, unknown> }))
vi.mock('react-player', () => ({
  default: (props: Record<string, unknown>) => {
    rp.props = props
    return null
  },
}))

const yt = 'https://www.youtube.com/watch?v=abc'
const detection = { type: 'youtube', originalUrl: yt, playableUrl: yt } as unknown as URLDetectionResult
const setActivation = (hasBeenActive: boolean | undefined) => {
  Object.defineProperty(navigator, 'userActivation', { value: hasBeenActive === undefined ? undefined : { hasBeenActive }, configurable: true })
}
const play = () => act(() => (rp.props.onPlay as () => void)())
const muteChange = (muted: boolean) => act(() => (rp.props.onVolumeChange as (e: unknown) => void)({ currentTarget: { volume: 0.5, muted } }))
const pill = () => screen.queryByRole('status', { name: /Playing muted/ })

describe('YouTubePlayer muted notice', () => {
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

  it('says it is playing muted when the browser made it start muted, and turns the sound on from the button', () => {
    setActivation(false)
    render(<YouTubePlayer url={yt} detection={detection} />)
    expect(pill()).toBeNull() // not before it plays
    play()
    expect(pill()).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Turn sound on' }))
    expect(rp.props.muted).toBe(false)
    expect(pill()).toBeNull()
  })

  it('shows nothing when it started with sound', () => {
    setActivation(true)
    render(<YouTubePlayer url={yt} detection={detection} />)
    play()
    expect(pill()).toBeNull()
  })

  it('shows nothing when the viewer muted it themselves', () => {
    setActivation(true)
    render(<YouTubePlayer url={yt} detection={detection} />)
    play()
    muteChange(true)
    expect(rp.props.muted).toBe(true)
    expect(pill()).toBeNull()
  })

  it('shows when sound autoplay was refused and it fell back to muted', () => {
    setActivation(true)
    render(<YouTubePlayer url={yt} detection={detection} />)
    act(() => {
      vi.advanceTimersByTime(3100)
    })
    play()
    expect(pill()).not.toBeNull()
  })

  it('goes away when the viewer unmutes with the player controls', () => {
    setActivation(false)
    render(<YouTubePlayer url={yt} detection={detection} />)
    play()
    muteChange(false)
    expect(pill()).toBeNull()
  })

  it('steps aside while the video is paused or has ended, and comes back when it plays again', () => {
    setActivation(false)
    render(<YouTubePlayer url={yt} detection={detection} />)
    play()
    act(() => (rp.props.onPause as () => void)())
    expect(pill()).toBeNull()
    play()
    expect(pill()).not.toBeNull()
    act(() => (rp.props.onEnded as () => void)())
    expect(pill()).toBeNull()
  })
})
