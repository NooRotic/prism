import { getUsersByIds, SessionExpiredError } from '../twitchApi'

function okResponse(ids: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: ids.map((id) => ({
        id,
        login: `user${id}`,
        display_name: `User ${id}`,
        profile_image_url: `https://cdn.example/${id}.png`,
      })),
    }),
  }
}

describe('getUsersByIds', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('issues no request for empty input', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await getUsersByIds([])
    expect(result).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends one request for 100 or fewer ids', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => String(i))
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(ids) as unknown as Response)

    const result = await getUsersByIds(ids)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(100)
  })

  it('chunks at 100 and merges the results in order', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => String(i))
    const chunkSizes: number[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      const chunk = url.searchParams.getAll('id')
      chunkSizes.push(chunk.length)
      return okResponse(chunk) as unknown as Response
    })

    const result = await getUsersByIds(ids)

    expect(chunkSizes).toEqual([100, 100, 1])
    expect(result).toHaveLength(201)
    expect(result.map((u) => u.id)).toEqual(ids)
  })

  it('survives one chunk failing and returns the rest', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(i))
    let call = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      call++
      if (call === 1) return { ok: false, status: 500 } as unknown as Response
      const url = new URL(String(input))
      return okResponse(url.searchParams.getAll('id')) as unknown as Response
    })

    const result = await getUsersByIds(ids)

    expect(result).toHaveLength(50)
  })

  it('survives one chunk rejecting outright', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(i))
    let call = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      call++
      if (call === 1) throw new TypeError('network down')
      const url = new URL(String(input))
      return okResponse(url.searchParams.getAll('id')) as unknown as Response
    })

    const result = await getUsersByIds(ids)

    expect(result).toHaveLength(50)
  })

  it('throws SessionExpiredError and clears the token on 401', async () => {
    localStorage.setItem('twitch_access_token', 'stale-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response)

    await expect(getUsersByIds(['1'])).rejects.toBeInstanceOf(SessionExpiredError)
    expect(localStorage.getItem('twitch_access_token')).toBeNull()
  })
})
