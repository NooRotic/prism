import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginPlayback,
  endPlayback,
  formatPlaybackReport,
  getPlaybackSnapshot,
  logPlayback,
  playbackWriter,
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

  it.each([
    ['a relative address with a query (as in a Video.js message)', 'video append of 12b failed for segment #0 in playlist 97-x/prog_index.m3u8?token=abc123 (retrying)', 'video append of 12b failed for segment #0 in playlist 97-x/prog_index.m3u8?token=*** (retrying)'],
    ['a query that is only a token', 'GET https://h.test/a.m3u8?abcdef123 failed', 'GET https://h.test/a.m3u8?*** failed'],
    ['a second parameter after a comma inside the query', 'https://h.test/a?x=1,token=abc2', 'https://h.test/a?x=***'],
    ['an address in quotes and brackets', "failed ('https://h.test/a?sig=zz9') now", "failed ('https://h.test/a?sig=***') now"],
    ['an IPv6 host', 'https://[2001:db8::1]:8443/a.m3u8?t=zz9', 'https://[2001:db8::1]:8443/a.m3u8?t=***'],
    ['an upper-case scheme with a login', 'HTTPS://user:pw@Host.test/a?x=1', 'HTTPS://***@Host.test/a?x=***'],
    ['a fragment that carries a token', 'https://h.test/cb#access_token=zz9', 'https://h.test/cb#***'],
    ['a query and then a fragment', 'https://h.test/a?x=1#frag', 'https://h.test/a?x=***#***'],
    ['a question inside a sentence', 'Could not load? Try again', 'Could not load? Try again'],
    ['a question at the end', 'Did it work?', 'Did it work?'],
    ['text that was already hidden', 'https://h.test/a?token=***', 'https://h.test/a?token=***'],
  ])('hides the secret in %s', (_label, input, expected) => {
    expect(redactText(input)).toBe(expected)
  })
})

describe('playbackWriter', () => {
  it('writes into the session it was made for', () => {
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })
    const out = playbackWriter()

    out.log('info', 'videojs', 'loadstart')
    out.setStatus('playing')
    out.setInspection({ readyState: 4 })

    expect(getPlaybackSnapshot()).toMatchObject({ status: 'playing', inspection: { readyState: 4 } })
    expect(getPlaybackSnapshot().entries.at(-1)?.message).toBe('loadstart')
  })

  it('stops writing once another session began, so an old engine cannot touch the next stream', () => {
    beginPlayback({ url: 'https://one.test/a.m3u8', kind: 'hls' })
    const old = playbackWriter()
    beginPlayback({ url: 'https://two.test/b.m3u8', kind: 'hls' })

    old.log('ok', 'videojs', 'playing')
    old.setStatus('playing')
    old.setInspection({ stale: true })

    const snapshot = getPlaybackSnapshot()
    expect(snapshot.status).toBe('starting')
    expect(snapshot.inspection).toBeNull()
    expect(snapshot.entries.map((entry) => entry.message)).toEqual(['Attempt 1: session started'])
  })

  it('stops writing when its session ended, and never writes if it was made while no session ran', () => {
    const early = playbackWriter()
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })
    const mine = playbackWriter()
    endPlayback()
    beginPlayback({ url: 'https://h.test/a.m3u8', kind: 'hls' })

    mine.log('info', 'videojs', 'late')
    early.log('info', 'videojs', 'early')

    expect(getPlaybackSnapshot().entries.map((entry) => entry.message)).toEqual(['Attempt 1: session started'])
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

  it('numbers the sessions, so a reader can tell that a new one began', () => {
    beginPlayback({ url: 'https://one.test/a.m3u8', kind: 'hls' })
    const first = getPlaybackSnapshot().session
    setPlaybackStatus('retrying')
    expect(getPlaybackSnapshot().session).toBe(first)

    beginPlayback({ url: 'https://one.test/a.m3u8', kind: 'hls' })

    expect(getPlaybackSnapshot().session).toBe(first + 1)
    endPlayback()
    expect(getPlaybackSnapshot().session).toBe(0)
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
