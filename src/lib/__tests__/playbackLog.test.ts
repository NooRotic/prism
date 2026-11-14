import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginPlayback,
  endPlayback,
  formatPlaybackReport,
  getPlaybackSnapshot,
  logPlayback,
  redactAddress,
  redactText,
  setAvoidedFormats,
  setPlaybackInspection,
  setPlaybackStatus,
  subscribePlayback,
  usePlaybackLog,
} from '../playbackLog'

beforeEach(() => {
  endPlayback()
  setAvoidedFormats([])
})

describe('redactAddress', () => {
  it.each([
    ['hides query values and keeps the keys, and drops the fragment', 'https://host.test/live/a.m3u8?token=secret&x=1#frag', 'https://host.test/live/a.m3u8?token=***&x=***'],
    ['hides a user name and password, and keeps the port', 'https://user:pw@host.test:8443/a.mpd', 'https://***@host.test:8443/a.mpd'],
    ['leaves an address with no query alone', 'https://host.test/a.m3u8', 'https://host.test/a.m3u8'],
    ['hides the value of a key with no value', 'https://host.test/a.m3u8?flag', 'https://host.test/a.m3u8?flag=***'],
    ['says so for text that is not an address', 'not an address', '(not an address)'],
    ['says so for nothing', '', '(not an address)'],
    ['says so for an address with no host', 'javascript:alert(1)', '(not an address)'],
  ])('%s', (_label, input, expected) => {
    expect(redactAddress(input)).toBe(expected)
  })
})

describe('redactText', () => {
  it('hides query values of every address inside a sentence, and keeps the punctuation after it', () => {
    expect(redactText('Failed loading manifest: https://h.test/a.mpd?sig=abc123, then https://h.test/b.m3u8?t=zzz.')).toBe(
      'Failed loading manifest: https://h.test/a.mpd?sig=***, then https://h.test/b.m3u8?t=***.',
    )
  })

  it('leaves text with no address alone', () => {
    expect(redactText('Video.js error 3')).toBe('Video.js error 3')
  })
})

describe('the playback log', () => {
  it('ignores log lines while no session is running', () => {
    logPlayback('info', 'videojs', 'loadstart')
    setPlaybackStatus('playing')

    expect(getPlaybackSnapshot()).toMatchObject({ status: 'idle', entries: [] })
  })

  it('starts a session as "starting", on attempt 1, with one line', () => {
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })

    const snapshot = getPlaybackSnapshot()
    expect(snapshot).toMatchObject({ status: 'starting', attempts: 1, url: 'https://h.test/a.m3u8', kind: 'hls', inspection: null })
    expect(typeof snapshot.startedAt).toBe('number')
    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entries[0]).toMatchObject({ level: 'info', source: 'session', message: 'Attempt 1: session started' })
  })

  it('keeps the newest 300 lines', () => {
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })
    for (let i = 0; i < 400; i++) logPlayback('info', 'videojs', `line ${i}`)

    const { entries } = getPlaybackSnapshot()
    expect(entries).toHaveLength(300)
    expect(entries[0].message).toBe('line 100')
    expect(entries.at(-1)?.message).toBe('line 399')
  })

  it('counts a retry as a new attempt and says so in the log', () => {
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })

    setPlaybackStatus('retrying')

    const snapshot = getPlaybackSnapshot()
    expect(snapshot.status).toBe('retrying')
    expect(snapshot.attempts).toBe(2)
    expect(snapshot.entries.at(-1)).toMatchObject({ level: 'warn', source: 'session', message: 'Attempt 2: retrying' })
  })

  it('moves to playing or failed without a new attempt', () => {
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })

    setPlaybackStatus('playing')
    expect(getPlaybackSnapshot()).toMatchObject({ status: 'playing', attempts: 1 })

    setPlaybackStatus('failed')
    expect(getPlaybackSnapshot()).toMatchObject({ status: 'failed', attempts: 1 })
  })

  it('starts clean when another session begins', () => {
    beginPlayback({ url: 'https://one.test/a.m3u8', kind: 'hls' })
    logPlayback('error', 'videojs', 'old failure')
    setPlaybackStatus('retrying')
    setPlaybackInspection({ readyState: 0 })

    beginPlayback({ url: 'https://two.test/b.mpd', kind: 'dash' })

    const snapshot = getPlaybackSnapshot()
    expect(snapshot).toMatchObject({ status: 'starting', attempts: 1, url: 'https://two.test/b.mpd', kind: 'dash', inspection: null })
    expect(snapshot.entries).toHaveLength(1)
  })

  it('goes back to idle, with nothing left, when the session ends', () => {
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })
    logPlayback('info', 'videojs', 'loadstart')

    endPlayback()

    expect(getPlaybackSnapshot()).toMatchObject({ status: 'idle', entries: [], url: null, kind: null, startedAt: null })
  })

  it('remembers the avoided formats across sessions', () => {
    setAvoidedFormats(['hevc'])
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })
    endPlayback()

    expect(getPlaybackSnapshot().avoided).toEqual(['hevc'])
  })

  it('keeps the last inspection of the player', () => {
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })

    setPlaybackInspection({ readyState: 0, rendition: '544x306' })

    expect(getPlaybackSnapshot().inspection).toEqual({ readyState: 0, rendition: '544x306' })
  })

  it('hands out the same snapshot until something changes', () => {
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })
    const before = getPlaybackSnapshot()
    expect(getPlaybackSnapshot()).toBe(before)

    logPlayback('info', 'videojs', 'loadstart')

    expect(getPlaybackSnapshot()).not.toBe(before)
  })

  it('does not change the snapshot for a line that is ignored', () => {
    const before = getPlaybackSnapshot()

    logPlayback('info', 'videojs', 'ignored')

    expect(getPlaybackSnapshot()).toBe(before)
  })

  it('tells each listener once per change, and none after it unsubscribes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePlayback(listener)

    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })
    logPlayback('info', 'videojs', 'loadstart')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    logPlayback('info', 'videojs', 'loadedmetadata')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('feeds a React hook', () => {
    const { result } = renderHook(() => usePlaybackLog())
    expect(result.current.status).toBe('idle')

    act(() => beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' }))
    act(() => logPlayback('ok', 'videojs', 'playing'))

    expect(result.current.status).toBe('starting')
    expect(result.current.entries.at(-1)?.message).toBe('playing')
  })
})

describe('formatPlaybackReport', () => {
  function runningSession() {
    beginPlayback({ url: 'https://host.test/live/a.m3u8?token=secret', kind: 'hls' })
    logPlayback('error', 'videojs', 'Video.js error 3', { code: 3 })
    logPlayback('warn', 'videojs', 'Failed loading https://host.test/live/a.m3u8?token=secret, retrying')
    setPlaybackStatus('retrying')
    setPlaybackInspection({ readyState: 0, rendition: '544x306' })
    setAvoidedFormats(['hevc'])
  }

  it('says where things stand, with every attempt, the timeline, the inspection and the browser', () => {
    runningSession()

    const report = formatPlaybackReport(getPlaybackSnapshot(), {
      environment: { userAgent: 'UA/1', codecs: { avc: true } },
      page: 'http://localhost:5000/hls-dash',
      now: new Date('2026-11-14T20:00:00Z'),
    })

    expect(report).toContain('Generated: 2026-11-14T20:00:00.000Z')
    expect(report).toContain('Page: http://localhost:5000/hls-dash')
    expect(report).toContain('Status: retrying')
    expect(report).toContain('Attempts: 2')
    expect(report).toContain('Type: hls')
    expect(report).toContain('Avoided formats: hevc')
    expect(report).toContain('Attempt 1: session started')
    expect(report).toContain('Attempt 2: retrying')
    expect(report).toContain('Video.js error 3')
    expect(report).toContain('"code":3')
    expect(report).toContain('readyState: 0')
    expect(report).toContain('rendition: 544x306')
    expect(report).toContain('userAgent: UA/1')
    expect(report).toContain('codecs: {"avc":true}')
  })

  it('never contains a query value, in the address or in a log line', () => {
    runningSession()

    const report = formatPlaybackReport(getPlaybackSnapshot(), {})

    expect(report).toContain('https://host.test/live/a.m3u8?token=***')
    expect(report).not.toContain('secret')
  })

  it('says so when nothing is playing, and when no format is avoided', () => {
    setAvoidedFormats([])

    const report = formatPlaybackReport(getPlaybackSnapshot(), {})

    expect(report).toContain('Status: idle')
    expect(report).toContain('Avoided formats: (none)')
    expect(report).toContain('Address: (none)')
  })
})
