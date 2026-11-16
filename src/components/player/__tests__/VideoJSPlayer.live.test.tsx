import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import videojs from 'video.js'
import VideoJSPlayer from '../VideoJSPlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'

const fake = vi.hoisted(() => ({
  player: {
    on: () => {},
    play: () => Promise.resolve(),
    isDisposed: () => false,
    dispose: () => {},
    error: () => null,
    currentTime: () => 0,
    duration: () => 0,
    paused: () => false,
    muted: () => false,
    volume: () => 1,
    buffered: () => ({ length: 0 }),
  },
}))

vi.mock('video.js', () => ({ default: vi.fn(() => fake.player) }))

const hls: URLDetectionResult = { type: 'hls', originalUrl: 'https://h/a.m3u8', playableUrl: 'https://h/a.m3u8' }

describe('VideoJSPlayer live stream controls', () => {
  afterEach(cleanup)

  it('turns on the live seek bar, so a stream that keeps a long window can be rewound', () => {
    render(<VideoJSPlayer url={hls.originalUrl} detection={hls} />)
    const options = vi.mocked(videojs).mock.calls[0][1] as { liveui?: boolean }
    expect(options.liveui).toBe(true)
  })
})
