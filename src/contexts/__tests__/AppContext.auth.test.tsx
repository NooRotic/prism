import { act, renderHook } from '@testing-library/react'
import { AppProvider, useApp } from '../AppContext'
import type { TwitchUser } from '../../types/twitch'

const user: TwitchUser = {
  id: '1',
  login: 'yourname',
  display_name: 'YourName',
  type: '',
  broadcaster_type: 'affiliate',
  description: '',
  profile_image_url: '',
  offline_image_url: '',
  view_count: 0,
  created_at: '2016-03-04T00:00:00Z',
}

function setup() {
  return renderHook(() => useApp(), { wrapper: AppProvider })
}

describe('AppContext auth state', () => {
  it('starts with no profile error and not expired', () => {
    const { result } = setup()

    expect(result.current.state.auth.profileError).toBe(false)
    expect(result.current.state.auth.expired).toBe(false)
  })

  it('records a failed profile load, and clears it when the viewer retries', () => {
    const { result } = setup()
    act(() => result.current.dispatch({ type: 'LOGIN', token: 't' }))

    act(() => result.current.dispatch({ type: 'LOGIN_USER_FAILED' }))
    expect(result.current.state.auth.profileError).toBe(true)

    act(() => result.current.dispatch({ type: 'LOGIN_USER_RETRY' }))
    expect(result.current.state.auth.profileError).toBe(false)
  })

  it('stores the profile and clears the error when it finally loads', () => {
    const { result } = setup()
    act(() => result.current.dispatch({ type: 'LOGIN', token: 't' }))
    act(() => result.current.dispatch({ type: 'LOGIN_USER_FAILED' }))

    act(() => result.current.dispatch({ type: 'LOGIN_USER_LOADED', user }))

    expect(result.current.state.auth.user).toEqual(user)
    expect(result.current.state.auth.profileError).toBe(false)
  })

  it('signs out and marks the session expired on TOKEN_EXPIRED', () => {
    const { result } = setup()
    act(() => result.current.dispatch({ type: 'LOGIN', token: 't' }))
    act(() => result.current.dispatch({ type: 'LOGIN_USER_LOADED', user }))

    act(() => result.current.dispatch({ type: 'TOKEN_EXPIRED' }))

    expect(result.current.state.auth).toEqual({
      token: null,
      isAuthenticated: false,
      user: null,
      profileError: false,
      expired: true,
    })
  })

  it('does not mark an ordinary LOGOUT as expired, and clears an earlier expiry', () => {
    const { result } = setup()
    act(() => result.current.dispatch({ type: 'TOKEN_EXPIRED' }))
    expect(result.current.state.auth.expired).toBe(true)

    act(() => result.current.dispatch({ type: 'LOGOUT' }))

    expect(result.current.state.auth.expired).toBe(false)
  })

  it('clears the expiry and any profile error on a new LOGIN', () => {
    const { result } = setup()
    act(() => result.current.dispatch({ type: 'TOKEN_EXPIRED' }))

    act(() => result.current.dispatch({ type: 'LOGIN', token: 'fresh' }))

    expect(result.current.state.auth).toMatchObject({
      token: 'fresh',
      isAuthenticated: true,
      expired: false,
      profileError: false,
    })
  })
})
