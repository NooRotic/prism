import { getChatColor, SessionExpiredError } from '../twitchApi'
import { STORAGE_KEYS } from '../../config/storageKeys'

function response(status: number, body: unknown = { data: [] }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('getChatColor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('returns the colour Twitch reports for the user', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, { data: [{ user_id: '42', color: '#9146FF' }] }))

    expect(await getChatColor('42')).toBe('#9146FF')
  })

  it('asks for chat/color with the user id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response(200, { data: [{ user_id: '42', color: '#9146FF' }] }))

    await getChatColor('42')

    const url = String(fetchSpy.mock.calls[0][0])
    expect(url).toContain('/chat/color')
    expect(url).toContain('user_id=42')
  })

  it('returns null when the user never set a colour', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, { data: [{ user_id: '42', color: '' }] }))

    expect(await getChatColor('42')).toBeNull()
  })

  it('returns null when Twitch returns no row', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, { data: [] }))

    expect(await getChatColor('42')).toBeNull()
  })

  it('treats an expired token as a session error and clears it', async () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(401))

    await expect(getChatColor('42')).rejects.toBeInstanceOf(SessionExpiredError)
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)).toBeNull()
  })
})
