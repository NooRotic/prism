import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VideoJSPlayer from '../VideoJSPlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'
import { readSavedVolume, saveVolume } from '../../../lib/playerVolume'

// A stand-in for the one video.js player with a working volume/muted pair, plus the handlers the component registers.
const fake = vi.hoisted(() => {
  const handlers: Record<string, Array<() => void>> = {}
  const state = { volume: 1, muted: false }
  const player = {
    on: (name: string, fn: () => void) => {
      ;(handlers[name] ??= []).push(fn)
    },
    play: vi.fn(() => Promise.resolve()),
    isDisposed: () => false,
    dispose: () => {},
    error: () => null,
    currentTime: () => 0,
    duration: () => 0,
    paused: () => false,
    muted: vi.fn((value?: boolean) => {
      if (value === undefined) return state.muted
      state.muted = value
      return undefined
    }),
    volume: vi.fn((value?: number) => {
      if (value === undefined) return state.volume
      state.volume = value
      return undefined
    }),
    buffered: () => ({ length: 0 }),
  }
  return {
    player,
    state,
    emit: (name: string) => (handlers[name] ?? []).forEach((fn) => fn()),
    reset: () => {
      for (const key of Object.keys(handlers)) delete handlers[key]
      state.volume = 1
      state.muted = false
      player.volume.mockClear()
      player.muted.mockClear()
      player.play.mockClear()
    },
  }
})

vi.mock('video.js', () => ({ default: vi.fn(() => fake.player) }))

const hls: URLDetectionResult = { type: 'hls', originalUrl: 'https://h/a.m3u8', playableUrl: 'https://h/a.m3u8' }

describe('VideoJSPlayer saved volume', () => {
  beforeEach(() => {
    fake.reset()
    localStorage.clear()
  })
  afterEach(cleanup)

  it('applies the saved volume when the player is ready, before it starts playing', () => {
    saveVolume(0.3)
    render(<VideoJSPlayer url={hls.originalUrl} detection={hls} />)
    fake.emit('ready')
    expect(fake.state.volume).toBe(0.3)
    expect(fake.player.volume.mock.invocationCallOrder[0]).toBeLessThan(fake.player.play.mock.invocationCallOrder[0])
  })

  it('leaves the volume alone when nothing is saved', () => {
    render(<VideoJSPlayer url={hls.originalUrl} detection={hls} />)
    fake.emit('ready')
    expect(fake.player.volume).not.toHaveBeenCalledWith(expect.any(Number))
  })

  it('saves the volume when the viewer changes it', () => {
    render(<VideoJSPlayer url={hls.originalUrl} detection={hls} />)
    fake.emit('ready')
    fake.state.volume = 0.65
    fake.emit('volumechange')
    expect(readSavedVolume()).toBe(0.65)
  })

  it('does not save before the saved volume has been restored', () => {
    saveVolume(0.3)
    render(<VideoJSPlayer url={hls.originalUrl} detection={hls} />)
    fake.state.volume = 1 // the element's default, reported by an early event
    fake.emit('volumechange')
    expect(readSavedVolume()).toBe(0.3)
  })

  it('a forced muted start does not change the saved volume', () => {
    saveVolume(0.3)
    render(<VideoJSPlayer url={hls.originalUrl} detection={hls} />)
    fake.emit('ready')
    fake.state.muted = true // autoplay policy forces muted; the volume itself is untouched
    fake.emit('volumechange')
    expect(readSavedVolume()).toBe(0.3)
  })
})
