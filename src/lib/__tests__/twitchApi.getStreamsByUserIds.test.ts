import { getStreamsByUserIds, SessionExpiredError } from '../twitchApi'
import { STORAGE_KEYS } from '../../config/storageKeys'

function response(status: number, body: unknown = { data: [] }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('getStreamsByUserIds', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('issues no request for empty input', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await getStreamsByUserIds([])).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the live streams, omitting channels that are offline', async () => {
    const stream = { user_id: '1', type: 'live', viewer_count: 5 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, { data: [stream] }))

    expect(await getStreamsByUserIds(['1', '2'])).toEqual([stream])
  })

  it('treats an expired token as a session error and clears it', async () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(401))

    await expect(getStreamsByUserIds(['1'])).rejects.toBeInstanceOf(SessionExpiredError)
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)).toBeNull()
  })

  // A failed request must not look like "nobody is live": callers that refresh
  // on a timer would otherwise blank the whole list on one rate-limit response.
  it.each([429, 500, 503])('rejects on HTTP %i instead of returning an empty list', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(status))

    await expect(getStreamsByUserIds(['1'])).rejects.toThrow(String(status))
  })
})
