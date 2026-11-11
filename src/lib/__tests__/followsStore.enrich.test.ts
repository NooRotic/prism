import { enrichFollows } from '../followsStore'
import type { TwitchFollowedChannel, TwitchStream } from '../../types/twitch'

function follow(id: string, login: string): TwitchFollowedChannel {
  return {
    broadcaster_id: id,
    broadcaster_login: login,
    broadcaster_name: login,
    followed_at: '2020-05-01T00:00:00Z',
  }
}

function stream(userId: string, overrides: Partial<TwitchStream> = {}): TwitchStream {
  return {
    id: `s${userId}`,
    user_id: userId,
    user_login: `user${userId}`,
    user_name: `User${userId}`,
    game_id: '1',
    game_name: 'Just Chatting',
    type: 'live',
    title: 'hello',
    viewer_count: 42,
    started_at: '2026-11-11T10:00:00Z',
    language: 'en',
    thumbnail_url: 'https://example.test/{width}x{height}.jpg',
    is_mature: false,
    tags: [],
    ...overrides,
  }
}

describe('enrichFollows', () => {
  it('keeps the stream language on a live follow', () => {
    const result = enrichFollows([follow('1', 'a')], [stream('1', { language: 'de' })])

    expect(result[0].language).toBe('de')
  })

  it('leaves language undefined on an offline follow', () => {
    const result = enrichFollows([follow('1', 'a')], [])

    expect(result[0].isLive).toBe(false)
    expect(result[0].language).toBeUndefined()
  })

  it('still carries viewerCount, gameName and startedAt for a live follow', () => {
    const result = enrichFollows([follow('1', 'a')], [stream('1')])

    expect(result[0]).toMatchObject({
      isLive: true,
      viewerCount: 42,
      gameName: 'Just Chatting',
      startedAt: '2026-11-11T10:00:00Z',
    })
  })
})
