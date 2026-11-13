import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeStream } from '../streamProbe'

function reply(status: number, body = '') {
  const text = vi.fn(async () => body)
  return { response: { ok: status >= 200 && status < 300, status, text } as unknown as Response, text }
}

function fetchReturning(response: Response) {
  return vi.fn(async () => response) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

const https = { pageProtocol: 'https:' }

afterEach(() => {
  vi.useRealTimers()
})

describe('probeStream', () => {
  it('names an http address on an https page without making a request', async () => {
    const fetchFn = fetchReturning(reply(200).response)
    expect(await probeStream('http://h/a.m3u8', 'hls', { ...https, fetchFn })).toEqual({ kind: 'mixed-content' })
    expect(await probeStream('HTTP://h/a.m3u8', 'hls', { ...https, fetchFn })).toEqual({ kind: 'mixed-content' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('still fetches an http address when the page itself is http', async () => {
    const fetchFn = fetchReturning(reply(200, '#EXTM3U').response)
    expect(await probeStream('http://h/a.m3u8', 'hls', { pageProtocol: 'http:', fetchFn })).toEqual({ kind: 'ok' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('asks for a fresh copy and can be aborted', async () => {
    const fetchFn = fetchReturning(reply(200, '#EXTM3U').response)
    await probeStream('https://h/a.m3u8', 'hls', { ...https, fetchFn })
    expect(fetchFn).toHaveBeenCalledWith(
      'https://h/a.m3u8',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
  })

  it('accepts an HLS playlist', async () => {
    const fetchFn = fetchReturning(reply(200, '#EXTM3U\n#EXT-X-VERSION:3').response)
    expect(await probeStream('https://h/a.m3u8', 'hls', { ...https, fetchFn })).toEqual({ kind: 'ok' })
  })

  it('accepts an HLS playlist that starts with a byte order mark and a blank line', async () => {
    const fetchFn = fetchReturning(reply(200, '﻿\n#EXTM3U\n').response)
    expect(await probeStream('https://h/a.m3u8', 'hls', { ...https, fetchFn })).toEqual({ kind: 'ok' })
  })

  it('says a web page is not an HLS playlist', async () => {
    const fetchFn = fetchReturning(reply(200, '<!doctype html><html>').response)
    expect(await probeStream('https://example.com/foo', 'hls', { ...https, fetchFn })).toEqual({
      kind: 'not-playlist',
    })
  })

  it('accepts a DASH manifest', async () => {
    const fetchFn = fetchReturning(reply(200, '<?xml version="1.0"?><MPD type="static">').response)
    expect(await probeStream('https://h/a.mpd', 'dash', { ...https, fetchFn })).toEqual({ kind: 'ok' })
  })

  it('says a web page is not a DASH manifest', async () => {
    const fetchFn = fetchReturning(reply(200, '<html><body>nope</body></html>').response)
    expect(await probeStream('https://h/a.mpd', 'dash', { ...https, fetchFn })).toEqual({ kind: 'not-playlist' })
  })

  it('reports the status of a failed response', async () => {
    const fetchFn = fetchReturning(reply(404).response)
    expect(await probeStream('https://h/a.m3u8', 'hls', { ...https, fetchFn })).toEqual({
      kind: 'http',
      status: 404,
    })
  })

  it('calls an address the browser cannot fetch unreachable', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await probeStream('https://h/a.m3u8', 'hls', { ...https, fetchFn })).toEqual({ kind: 'unreachable' })
  })

  it('calls an address whose body cannot be read unreachable', async () => {
    const response = { ok: true, status: 200, text: vi.fn(async () => Promise.reject(new TypeError('aborted'))) }
    const fetchFn = fetchReturning(response as unknown as Response)
    expect(await probeStream('https://h/a.m3u8', 'hls', { ...https, fetchFn })).toEqual({ kind: 'unreachable' })
  })

  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers()
    let seen: AbortSignal | undefined
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          seen = init?.signal ?? undefined
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    ) as unknown as typeof fetch
    const result = probeStream('https://h/a.m3u8', 'hls', { ...https, fetchFn, timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toEqual({ kind: 'unreachable' })
    expect(seen?.aborted).toBe(true)
  })

  it('accepts an mp4 on a 2xx without reading the body', async () => {
    const { response, text } = reply(200, 'binary')
    const fetchFn = fetchReturning(response)
    expect(await probeStream('https://h/a.mp4', 'mp4', { ...https, fetchFn })).toEqual({ kind: 'ok' })
    expect(text).not.toHaveBeenCalled()
  })
})
