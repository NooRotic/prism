import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashJSPlayer from '../DashJSPlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'
import { readSavedVolume, saveVolume } from '../../../lib/playerVolume'

const dash = vi.hoisted(() => {
  const handlers: Record<string, (event?: unknown) => void> = {}
  const player = {
    on: (name: string, fn: (event?: unknown) => void) => {
      handlers[name] = fn
    },
    initialize: vi.fn(),
    play: vi.fn(),
    destroy: vi.fn(),
  }
  return { player, handlers }
})
vi.mock('dashjs', () => ({ MediaPlayer: () => ({ create: () => dash.player }) }))

const URL_OF = 'https://h.test/live/a.mpd'
const detection: URLDetectionResult = { type: 'dash', originalUrl: URL_OF, playableUrl: URL_OF }

describe('DashJSPlayer saved volume', () => {
  beforeEach(() => {
    dash.player.initialize.mockClear()
    for (const key of Object.keys(dash.handlers)) delete dash.handlers[key]
    localStorage.clear()
  })
  afterEach(cleanup)

  it('applies the saved volume before dash.js starts, and again once the stream initialises', async () => {
    saveVolume(0.3)
    let atInitialize: number | null = null
    dash.player.initialize.mockImplementation((el: HTMLVideoElement) => {
      atInitialize = el.volume
    })
    const { container } = render(<DashJSPlayer url={URL_OF} detection={detection} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())
    const video = container.querySelector('video')!
    expect(atInitialize).toBe(0.3)

    video.volume = 1 // something resets it while loading
    dash.handlers.streamInitialized()
    expect(video.volume).toBe(0.3)
  })

  it('saves the volume when the viewer changes it', async () => {
    const { container } = render(<DashJSPlayer url={URL_OF} detection={detection} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())
    const video = container.querySelector('video')!
    dash.handlers.streamInitialized()
    video.volume = 0.6
    video.dispatchEvent(new Event('volumechange'))
    expect(readSavedVolume()).toBe(0.6)
  })

  it('a forced muted start does not change the saved volume', async () => {
    saveVolume(0.3)
    const { container } = render(<DashJSPlayer url={URL_OF} detection={detection} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())
    dash.handlers.playbackNotAllowed()
    container.querySelector('video')!.dispatchEvent(new Event('volumechange'))
    expect(readSavedVolume()).toBe(0.3)
  })
})
