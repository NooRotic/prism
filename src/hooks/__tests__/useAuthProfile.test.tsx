import { act, renderHook, waitFor } from '@testing-library/react'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { getAuthenticatedUser, SessionExpiredError } from '../../lib/twitchApi'
import { useAuthProfile } from '../useAuthProfile'
import type { TwitchUser } from '../../types/twitch'

vi.mock('../../lib/twitchApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/twitchApi')>()
  return { ...actual, getAuthenticatedUser: vi.fn() }
})

const mockProfile = vi.mocked(getAuthenticatedUser)

const user: TwitchUser = {
  id: '1',
  login: 'yourname',
  display_name: 'YourName',
  type: '',
  broadcaster_type: '',
  description: '',
  profile_image_url: '',
  offline_image_url: '',
  view_count: 0,
  created_at: '2016-03-04T00:00:00Z',
}

function setup() {
  return renderHook(
    () => {
      useAuthProfile()
      return useApp()
    },
    { wrapper: AppProvider },
  )
}

function signIn() {
  localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')
}

describe('useAuthProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('loads the profile once after sign-in', async () => {
    signIn()
    mockProfile.mockResolvedValue(user)
    const { result } = setup()

    await waitFor(() => expect(result.current.state.auth.user).toEqual(user))
    expect(mockProfile).toHaveBeenCalledTimes(1)
  })

  it('makes no request while signed out', () => {
    mockProfile.mockResolvedValue(user)
    setup()

    expect(mockProfile).not.toHaveBeenCalled()
  })

  it('records a failure that is not an expired session, and does not retry on its own', async () => {
    signIn()
    mockProfile.mockRejectedValue(new Error('Twitch API error: 500'))
    const { result } = setup()

    await waitFor(() => expect(result.current.state.auth.profileError).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(mockProfile).toHaveBeenCalledTimes(1)
    expect(result.current.state.auth.isAuthenticated).toBe(true)
  })

  it('fetches again when the viewer retries', async () => {
    signIn()
    mockProfile.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(user)
    const { result } = setup()
    await waitFor(() => expect(result.current.state.auth.profileError).toBe(true))

    act(() => result.current.dispatch({ type: 'LOGIN_USER_RETRY' }))

    await waitFor(() => expect(result.current.state.auth.user).toEqual(user))
    expect(mockProfile).toHaveBeenCalledTimes(2)
    expect(result.current.state.auth.profileError).toBe(false)
  })

  it('signs the viewer out when the session has expired', async () => {
    signIn()
    mockProfile.mockRejectedValue(new SessionExpiredError())
    const { result } = setup()

    await waitFor(() => expect(result.current.state.auth.isAuthenticated).toBe(false))
    expect(result.current.state.auth.profileError).toBe(false)
  })
})
