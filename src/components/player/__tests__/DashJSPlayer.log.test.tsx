import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashJSPlayer from '../DashJSPlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'
import { beginPlayback, endPlayback, getPlaybackSnapshot } from '../../../lib/playbackLog'

// A stand-in for dash.js: it keeps the handlers the component registers so a test can fire the events a real player would.
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

const URL_OF = 'https://h.test/live/a.mpd?sig=abc123'
const detection: URLDetectionResult = { type: 'dash', originalUrl: URL_OF, playableUrl: URL_OF }
const messages = () => getPlaybackSnapshot().entries.map((entry) => entry.message)

describe('DashJSPlayer and the playback log', () => {
  beforeEach(() => {
    dash.player.initialize.mockClear()
    dash.player.play.mockClear()
    for (const key of Object.keys(dash.handlers)) delete dash.handlers[key]
    endPlayback()
    beginPlayback({ url: URL_OF, kind: 'dash' })
  })

  afterEach(() => {
    cleanup()
    endPlayback()
  })

  it('writes down where it is loading from, without the query value', async () => {
    render(<DashJSPlayer url={URL_OF} detection={detection} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())

    expect(messages()).toEqual(expect.arrayContaining(['loading https://h.test/live/a.mpd?sig=***']))
    expect(messages().join('\n')).not.toContain('abc123')
  })

  it('writes down that the stream initialised', async () => {
    render(<DashJSPlayer url={URL_OF} detection={detection} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())

    dash.handlers.streamInitialized()

    expect(getPlaybackSnapshot().entries.at(-1)).toMatchObject({ level: 'ok', source: 'dashjs', message: 'stream initialised' })
  })

  it('writes down an error with its code, and hides an address inside its message', async () => {
    render(<DashJSPlayer url={URL_OF} detection={detection} onError={vi.fn()} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())

    dash.handlers.error({ error: { message: 'Failed loading manifest: https://h.test/live/a.mpd?sig=abc123, retrying', code: 10 } })

    const last = getPlaybackSnapshot().entries.at(-1)
    expect(last).toMatchObject({ level: 'error', source: 'dashjs', data: { code: 10 } })
    expect(last?.message).toBe('Failed loading manifest: https://h.test/live/a.mpd?sig=***, retrying')
  })

  it('ignores a late event from this player once another session has begun', async () => {
    const { container } = render(<DashJSPlayer url={URL_OF} detection={detection} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())
    beginPlayback({ url: 'https://other.test/b.mpd', kind: 'dash' })

    container.querySelector('video')!.dispatchEvent(new Event('playing'))
    dash.handlers.streamInitialized()

    expect(getPlaybackSnapshot().status).toBe('starting')
    expect(messages()).toEqual(['Attempt 1: session started'])
  })

  it('starts with sound: not muted, and dash.js is asked to start playing', async () => {
    const { container } = render(<DashJSPlayer url={URL_OF} detection={detection} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())

    const video = container.querySelector('video')!
    expect(video.muted).toBe(false)
    expect(dash.player.initialize).toHaveBeenCalledWith(video, URL_OF, true)
  })

  it('when dash.js says playback is not allowed, mutes and plays again, once, and says so', async () => {
    const onPlaybackBlocked = vi.fn()
    const { container } = render(<DashJSPlayer url={URL_OF} detection={detection} onPlaybackBlocked={onPlaybackBlocked} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())
    const video = container.querySelector('video')!

    dash.handlers.playbackNotAllowed()

    expect(video.muted).toBe(true)
    expect(dash.player.play).toHaveBeenCalledTimes(1)
    expect(onPlaybackBlocked).not.toHaveBeenCalled()
    expect(getPlaybackSnapshot().entries.some((entry) => entry.level === 'warn' && entry.message.includes('sound') && entry.message.includes('muted'))).toBe(true)

    dash.handlers.playbackNotAllowed()

    expect(dash.player.play).toHaveBeenCalledTimes(1)
    expect(onPlaybackBlocked).toHaveBeenCalledTimes(1)
  })

  it('moves the session to playing when the video starts playing', async () => {
    const { container } = render(<DashJSPlayer url={URL_OF} detection={detection} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())

    container.querySelector('video')!.dispatchEvent(new Event('playing'))

    expect(getPlaybackSnapshot().status).toBe('playing')
    expect(getPlaybackSnapshot().entries.at(-1)).toMatchObject({ level: 'ok', source: 'dashjs', message: 'playing' })
  })
})
