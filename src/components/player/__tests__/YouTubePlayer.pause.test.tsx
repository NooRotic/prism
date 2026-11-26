import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import YouTubePlayer from '../YouTubePlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'

// A stand-in that does what react-player 3 does (dist/Player.js): after every render it plays a paused video when told
// `playing`, and pauses a playing one when told not to, and it sets the volume it is given (or 1) every time.
const media = vi.hoisted(() => ({ paused: true, volume: 1, plays: 0, props: {} as Record<string, unknown> }))
vi.mock('react-player', () => ({
  default: function ReactPlayerLike(props: Record<string, unknown>) {
    media.props = props
    useEffect(() => {
      if (media.paused && props.playing === true) {
        media.plays += 1
        media.paused = false
      }
      if (!media.paused && props.playing === false) media.paused = true
      media.volume = (props.volume as number | undefined) ?? 1
    })
    return null
  },
}))

const yt = 'https://www.youtube.com/watch?v=abc'
const detection = { type: 'youtube', originalUrl: yt, playableUrl: yt } as unknown as URLDetectionResult
const call = (name: string, event?: unknown) => act(() => (media.props[name] as (e?: unknown) => void)(event))

/** The viewer pauses with YouTube's own controls: the video stops, then the player reports it. */
const viewerPauses = () => {
  media.paused = true
  call('onPause')
}
const viewerPlays = () => {
  media.paused = false
  call('onPlay')
}

beforeEach(() => {
  media.paused = true
  media.volume = 1
  media.plays = 0
  media.props = {}
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('YouTubePlayer pause', () => {
  it('starts playing by itself', () => {
    render(<YouTubePlayer url={yt} detection={detection} />)
    expect(media.plays).toBe(1)
    expect(media.paused).toBe(false)
  })

  it('stays paused when the viewer pauses it', () => {
    render(<YouTubePlayer url={yt} detection={detection} />)
    viewerPlays()
    viewerPauses()
    expect(media.paused).toBe(true)
    expect(media.plays).toBe(1)
  })

  it('stays paused while the page draws again for other reasons', () => {
    const { rerender } = render(<YouTubePlayer url={yt} detection={detection} />)
    viewerPlays()
    viewerPauses()
    rerender(<YouTubePlayer url={yt} detection={detection} onPlay={() => {}} />)
    act(() => vi.advanceTimersByTime(10_000))
    expect(media.paused).toBe(true)
  })

  it('plays again when the viewer presses play', () => {
    render(<YouTubePlayer url={yt} detection={detection} />)
    viewerPlays()
    viewerPauses()
    viewerPlays()
    expect(media.paused).toBe(false)
    expect(media.props.playing).toBe(true)
  })

  it('a finished video is not started over', () => {
    render(<YouTubePlayer url={yt} detection={detection} />)
    viewerPlays()
    media.paused = true
    call('onEnded')
    expect(media.paused).toBe(true)
    expect(media.plays).toBe(1)
  })

  it('a sound start the browser refuses still falls back to a muted start', () => {
    Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: true }, configurable: true })
    try {
      render(<YouTubePlayer url={yt} detection={detection} />)
      expect(media.props.muted).toBe(false)
      media.paused = true
      call('onPause') // the refused play() comes back as a pause
      act(() => vi.advanceTimersByTime(3000))
      expect(media.props.muted).toBe(true)
      expect(media.paused).toBe(false)
    } finally {
      Object.defineProperty(navigator, 'userActivation', { value: undefined, configurable: true })
    }
  })

  it('a new video starts playing by itself again', () => {
    const { rerender } = render(<YouTubePlayer url={yt} detection={detection} />)
    viewerPlays()
    viewerPauses()
    rerender(<YouTubePlayer url="https://www.youtube.com/watch?v=xyz" detection={detection} />)
    expect(media.props.playing).toBe(true)
  })
})

describe('YouTubePlayer volume', () => {
  it('keeps the volume the viewer sets with YouTube’s own controls', () => {
    const { rerender } = render(<YouTubePlayer url={yt} detection={detection} />)
    viewerPlays()
    call('onVolumeChange', { currentTarget: { volume: 0.3, muted: false } })
    rerender(<YouTubePlayer url={yt} detection={detection} onPlay={() => {}} />)
    expect(media.volume).toBe(0.3)
  })
})
