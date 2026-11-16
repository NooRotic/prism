import { cleanup, render } from '@testing-library/react'
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
