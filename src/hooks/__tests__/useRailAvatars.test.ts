import { renderHook, waitFor } from '@testing-library/react'
import { useRailAvatars } from '../useRailAvatars'
import { getUsersByIds } from '../../lib/twitchApi'

vi.mock('../../lib/twitchApi', () => ({
  getUsersByIds: vi.fn(),
}))

const mockedGetUsersByIds = vi.mocked(getUsersByIds)

function user(id: string) {
  return {
    id,
    login: `u${id}`,
    display_name: `U${id}`,
    profile_image_url: `https://cdn.example/${id}.png`,
  }
}

describe('useRailAvatars', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps user ids to profile image urls', async () => {
    mockedGetUsersByIds.mockResolvedValue([
      user('1'),
      user('2'),
    ] as unknown as Awaited<ReturnType<typeof getUsersByIds>>)

    const { result } = renderHook(() => useRailAvatars(['1', '2']))

    await waitFor(() => expect(result.current.size).toBe(2))
    expect(result.current.get('1')).toBe('https://cdn.example/1.png')
    expect(result.current.get('2')).toBe('https://cdn.example/2.png')
  })

  it('issues no request for an empty id list', () => {
    renderHook(() => useRailAvatars([]))
    expect(mockedGetUsersByIds).not.toHaveBeenCalled()
  })

  it('returns an empty map when the fetch rejects, without throwing', async () => {
    mockedGetUsersByIds.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useRailAvatars(['1']))

    await waitFor(() => expect(mockedGetUsersByIds).toHaveBeenCalled())
    expect(result.current.size).toBe(0)
  })

  it('returns a partial map when only some profiles come back', async () => {
    mockedGetUsersByIds.mockResolvedValue([user('1')] as unknown as Awaited<
      ReturnType<typeof getUsersByIds>
    >)

    const { result } = renderHook(() => useRailAvatars(['1', '2']))

    await waitFor(() => expect(result.current.size).toBe(1))
    expect(result.current.has('2')).toBe(false)
  })

  it('does not refetch when the same ids arrive in a new array', async () => {
    mockedGetUsersByIds.mockResolvedValue([user('1')] as unknown as Awaited<
      ReturnType<typeof getUsersByIds>
    >)

    const { rerender } = renderHook(({ ids }) => useRailAvatars(ids), {
      initialProps: { ids: ['1', '2'] },
    })
    await waitFor(() => expect(mockedGetUsersByIds).toHaveBeenCalledTimes(1))

    rerender({ ids: ['2', '1'] })
    rerender({ ids: ['1', '2'] })

    expect(mockedGetUsersByIds).toHaveBeenCalledTimes(1)
  })
})
