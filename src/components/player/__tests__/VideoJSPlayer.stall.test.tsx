import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VideoJSPlayer from '../VideoJSPlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'

// A stand-in for the one video.js player: it records the handlers the component registers so a
// test can fire the events a real player would.
const fake = vi.hoisted(() => {
  const handlers: Record<string, Array<() => void>> = {}
  const player = {
    on: (name: string, fn: () => void) => {
      ;(handlers[name] ??= []).push(fn)
    },
    play: () => Promise.resolve(),
    isDisposed: () => false,
    dispose: () => {},
    error: vi.fn((): { code?: number; message?: string } | null => null),
    currentTime: () => 0,
    duration: () => 0,
    paused: () => false,
    muted: () => true,
    volume: () => 1,
    buffered: () => ({ length: 0 }),
  }
  return {
    player,
    emit: (name: string) => (handlers[name] ?? []).forEach((fn) => fn()),
    reset: () => {
      for (const key of Object.keys(handlers)) delete handlers[key]
      player.error.mockReturnValue(null)
    },
  }
})

vi.mock('video.js', () => ({ default: vi.fn(() => fake.player) }))

const hls: URLDetectionResult = {
  type: 'hls',
  originalUrl: 'https://h/a.m3u8',
  playableUrl: 'https://h/a.m3u8',
}

function mount(props: Partial<React.ComponentProps<typeof VideoJSPlayer>> = {}) {
  return render(<VideoJSPlayer url={hls.originalUrl} detection={hls} {...props} />)
}

describe('VideoJSPlayer stall detection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fake.reset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('stays quiet until 12 seconds have passed', () => {
    const onStall = vi.fn()
    mount({ onStall })
    vi.advanceTimersByTime(11_999)
    expect(onStall).not.toHaveBeenCalled()
  })

  it('reports one stall at 12 seconds without failing the player', () => {
    const onStall = vi.fn()
    const onError = vi.fn()
    mount({ onStall, onError })
    vi.advanceTimersByTime(12_000)
    expect(onStall).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('is not stalled once the first data has loaded', () => {
    const onStall = vi.fn()
    mount({ onStall })
    vi.advanceTimersByTime(5_000)
    fake.emit('loadeddata')
    vi.advanceTimersByTime(30_000)
    expect(onStall).not.toHaveBeenCalled()
  })

  it('is not stalled once playing', () => {
    const onStall = vi.fn()
    mount({ onStall })
    fake.emit('playing')
    vi.advanceTimersByTime(30_000)
    expect(onStall).not.toHaveBeenCalled()
  })

  it('still reports a stall when only ready fired, since ready comes right after init', () => {
    const onStall = vi.fn()
    const onReady = vi.fn()
    mount({ onStall, onReady })
    fake.emit('ready')
    vi.advanceTimersByTime(12_000)
    expect(onReady).toHaveBeenCalled()
    expect(onStall).toHaveBeenCalledTimes(1)
  })

  it('falls back to an error when nothing listens for stalls', () => {
    const onError = vi.fn()
    mount({ onError })
    vi.advanceTimersByTime(12_000)
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('12 seconds'))
  })

  it('tells the page when playback is running', () => {
    const onPlaying = vi.fn()
    mount({ onPlaying })
    fake.emit('playing')
    expect(onPlaying).toHaveBeenCalledTimes(1)
  })

  it('words a source the player cannot use without blaming autoplay', () => {
    const onError = vi.fn()
    mount({ onError })
    fake.player.error.mockReturnValue({ code: 4, message: 'ignored' })
    fake.emit('error')
    expect(onError).toHaveBeenCalledWith('Video.js could not use this source (code 4)')
  })
})
