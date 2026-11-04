import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getStoredToken,
  clearToken,
  isAuthenticated,
  handleTwitchRedirect,
} from '../twitchAuth'

describe('twitchAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    // Note: setup.ts uses same mock for localStorage and sessionStorage,
    // so clearing localStorage also clears sessionStorage.

    // Reset window.location.hash
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        hash: '',
        hostname: 'localhost',
        pathname: '/',
        search: '',
        origin: 'http://localhost:5173',
      },
    })

    // Mock history.replaceState
    window.history.replaceState = vi.fn()
  })

  describe('getStoredToken / isAuthenticated', () => {
    it('returns null when no token is stored', () => {
      expect(getStoredToken()).toBeNull()
    })

    it('returns false for isAuthenticated when no token', () => {
      expect(isAuthenticated()).toBe(false)
    })

    it('returns the token when stored', () => {
      localStorage.setItem('twitch_access_token', 'my_token_123')
      expect(getStoredToken()).toBe('my_token_123')
    })

    it('returns true for isAuthenticated when token exists', () => {
      localStorage.setItem('twitch_access_token', 'my_token_123')
      expect(isAuthenticated()).toBe(true)
    })
  })

  describe('clearToken', () => {
    it('removes the token from localStorage', () => {
      localStorage.setItem('twitch_access_token', 'my_token_123')
      expect(getStoredToken()).toBe('my_token_123')
      clearToken()
      expect(getStoredToken()).toBeNull()
      expect(isAuthenticated()).toBe(false)
    })
  })

  describe('handleTwitchRedirect', () => {
    it('returns null when there is no hash', () => {
      window.location.hash = ''
      expect(handleTwitchRedirect()).toBeNull()
    })

    it('stores and returns the access_token from the hash', () => {
      const state = 'abc123'
      // Since localStorage and sessionStorage share the same mock store,
      // setting via sessionStorage key works through localStorage too.
      sessionStorage.setItem('twitch_oauth_state', state)

      window.location.hash = `#access_token=token_xyz&state=${state}&token_type=bearer`
      const result = handleTwitchRedirect()
      expect(result).toBe('token_xyz')
      expect(localStorage.getItem('twitch_access_token')).toBe('token_xyz')
    })

    it('returns null on state mismatch', () => {
      sessionStorage.setItem('twitch_oauth_state', 'expected_state')
      window.location.hash = '#access_token=token_xyz&state=wrong_state&token_type=bearer'
      const result = handleTwitchRedirect()
      expect(result).toBeNull()
    })

    describe('fails closed when the CSRF state cannot be verified', () => {
      beforeEach(() => {
        // Rejections are logged via logger.error; keep test output quiet.
        vi.spyOn(console, 'error').mockImplementation(() => {})
      })

      afterEach(() => {
        vi.restoreAllMocks()
      })

      it('rejects a token when the callback omits the state parameter', () => {
        sessionStorage.setItem('twitch_oauth_state', 'expected_state')
        window.location.hash = '#access_token=token_xyz&token_type=bearer'

        expect(handleTwitchRedirect()).toBeNull()
        expect(localStorage.getItem('twitch_access_token')).toBeNull()
      })

      it('rejects a token when no saved state exists to compare against', () => {
        window.location.hash = '#access_token=token_xyz&state=forged_state&token_type=bearer'

        expect(handleTwitchRedirect()).toBeNull()
        expect(localStorage.getItem('twitch_access_token')).toBeNull()
      })

      it('rejects a token when both the state parameter and the saved state are missing', () => {
        window.location.hash = '#access_token=token_xyz&token_type=bearer'

        expect(handleTwitchRedirect()).toBeNull()
        expect(localStorage.getItem('twitch_access_token')).toBeNull()
      })
    })
  })
})
