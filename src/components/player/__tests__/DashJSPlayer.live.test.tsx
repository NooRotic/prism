import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashJSPlayer from '../DashJSPlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'

const dash = vi.hoisted(() => {
  const state = { dynamic: true, window: { start: 1000, end: 2800, size: 1800, startAsUtc: 0, endAsUtc: 0 } }
  const player = {
    on: () => {},
    initialize: vi.fn(),
    play: vi.fn(),
    destroy: vi.fn(),
    isDynamic: () => state.dynamic,
    getDvrWindow: () => state.window,
    seek: vi.fn(),
    seekToOriginalLive: vi.fn(),
  }
  return { player, state }
})
vi.mock('dashjs', () => ({ MediaPlayer: () => ({ create: () => dash.player }) }))

const URL_OF = 'https://h.test/live/a.mpd'
const detection: URLDetectionResult = { type: 'dash', originalUrl: URL_OF, playableUrl: URL_OF }

async function renderPlaying(currentTime: number) {
  const view = render(<DashJSPlayer url={URL_OF} detection={detection} />)
  await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())
  const video = view.container.querySelector('video')!
  Object.defineProperty(video, 'currentTime', { configurable: true, value: currentTime })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  return view
}

describe('DashJSPlayer live rewind bar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    dash.state.dynamic = true
    dash.state.window = { start: 1000, end: 2800, size: 1800, startAsUtc: 0, endAsUtc: 0 }
    dash.player.initialize.mockClear()
    dash.player.seek.mockClear()
    dash.player.seekToOriginalLive.mockClear()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows a rewind bar for a live stream with a long window, with the distance behind live', async () => {
    await renderPlaying(2500)
    expect(screen.getByLabelText('Rewind live stream')).toBeInTheDocument()
    expect(screen.getByText('-5:00')).toBeInTheDocument()
  })

  it('shows no bar for a stream that is not live', async () => {
    dash.state.dynamic = false
    await renderPlaying(10)
    expect(screen.queryByLabelText('Rewind live stream')).toBeNull()
  })

  it('shows no bar when the window is too short to scrub', async () => {
    dash.state.window = { start: 2780, end: 2800, size: 20, startAsUtc: 0, endAsUtc: 0 }
    await renderPlaying(2795)
    expect(screen.queryByLabelText('Rewind live stream')).toBeNull()
  })

  it('seeks to the chosen point in the window', async () => {
    await renderPlaying(2800)
    // 600 s from the oldest point is 1200 s behind live: time 1600.
    fireEvent.change(screen.getByLabelText('Rewind live stream'), { target: { value: '600' } })
    expect(dash.player.seek).toHaveBeenCalledWith(1600)
  })

  it('LIVE jumps back to the live edge', async () => {
    await renderPlaying(2500)
    fireEvent.click(screen.getByRole('button', { name: 'Go to live' }))
    expect(dash.player.seekToOriginalLive).toHaveBeenCalled()
  })
})
