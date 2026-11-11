import { act, renderHook } from '@testing-library/react'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useSessionExpiry } from '../useSessionExpiry'

function setup() {
  return renderHook(() => ({ expire: useSessionExpiry(), app: useApp() }), { wrapper: AppProvider })
}

describe('useSessionExpiry', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')
  })

  it('removes the stored token and leaves the viewer signed out with the session marked expired', () => {
    const { result } = setup()
    expect(result.current.app.state.auth.isAuthenticated).toBe(true)

    act(() => result.current.expire())

    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)).toBeNull()
    expect(result.current.app.state.auth.isAuthenticated).toBe(false)
    expect(result.current.app.state.auth.expired).toBe(true)
  })

  it('returns the same function on every render', () => {
    const { result, rerender } = setup()
    const first = result.current.expire

    rerender()

    expect(result.current.expire).toBe(first)
  })
})
