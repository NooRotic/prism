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

  it('moves the session to playing when the video starts playing', async () => {
    const { container } = render(<DashJSPlayer url={URL_OF} detection={detection} />)
    await waitFor(() => expect(dash.player.initialize).toHaveBeenCalled())

    container.querySelector('video')!.dispatchEvent(new Event('playing'))

    expect(getPlaybackSnapshot().status).toBe('playing')
    expect(getPlaybackSnapshot().entries.at(-1)).toMatchObject({ level: 'ok', source: 'dashjs', message: 'playing' })
  })
})
