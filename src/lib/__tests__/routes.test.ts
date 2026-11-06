import { isPlayerPagePath } from '../routes'

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
