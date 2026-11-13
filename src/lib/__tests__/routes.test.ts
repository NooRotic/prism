import { isPlayerPagePath, buildStreamPath, CUSTOM_STREAM_ID } from '../routes'

describe('isPlayerPagePath', () => {
  it.each(['/twitch/streamer', '/youtube/abc', '/hls-dash/some-stream'])('is true for %s, which plays a video', (path) => {
    expect(isPlayerPagePath(path)).toBe(true)
  })

  it.each(['/', '/twitch', '/youtube', '/hls-dash', '/nope', '/chat/streamer'])(
    'is false for %s',
    (path) => {
      expect(isPlayerPagePath(path)).toBe(false)
    },
  )
})

describe('buildStreamPath', () => {
  it('uses the reserved custom id', () => {
    expect(CUSTOM_STREAM_ID).toBe('custom')
  })

  it('puts the encoded address in the url query', () => {
    expect(buildStreamPath('https://h/a.m3u8')).toBe('/hls-dash/custom?url=https%3A%2F%2Fh%2Fa.m3u8')
  })

  it('appends the forced kind', () => {
    expect(buildStreamPath('https://h/a', 'dash')).toMatch(/&as=dash$/)
  })

  it('keeps a token address intact through a round trip', () => {
    const u = 'https://h/p.m3u8?token=a=b&c=d%20e'
    expect(new URL(buildStreamPath(u, 'hls'), 'http://x').searchParams.get('url')).toBe(u)
  })

  it('is a player page path', () => {
    expect(isPlayerPagePath(buildStreamPath('https://h/a.m3u8').split('?')[0])).toBe(true)
  })
})
