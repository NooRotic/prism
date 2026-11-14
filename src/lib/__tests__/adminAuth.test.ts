import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/storageKeys'

/**
 * adminAuth reads VITE_TWITCH_CLIENT_ID once, when the module loads, so each test stubs the env var and
 * imports a fresh copy (as twitchAuth.login.test.ts does).
 */
async function loadAdminAuth(clientId = 'test-client-id') {
  vi.stubEnv('VITE_TWITCH_CLIENT_ID', clientId)
  vi.resetModules()
  return import('../adminAuth')
}

function setLocation(parts: { hash?: string; search?: string; pathname?: string }) {
  // jsdom cannot navigate; give the code a plain object it can assign `href` to.
  Object.defineProperty(window, 'location', {
    writable: true,
    value: {
      ...window.location,
      href: 'http://localhost:5173/',
      hash: parts.hash ?? '',
      search: parts.search ?? '',
      pathname: parts.pathname ?? '/',
      hostname: 'localhost',
      origin: 'http://localhost:5173',
    },
  })
}

const sentUrl = () => new URL(window.location.href)
const VIEWER_TOKEN_KEY = STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN

describe('admin sign-in', () => {
  beforeEach(() => {
    // setup.ts backs localStorage and sessionStorage with one mock, so this clears both and the tests
    // assert on key names (the admin keys against the viewer keys), not on which storage holds a value.
    localStorage.clear()
    setLocation({})
    window.history.replaceState = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('startAdminSignIn', () => {
    it('asks Twitch for an identity-only token with its own state, and always shows the authorise screen', async () => {
      const { startAdminSignIn } = await loadAdminAuth()

      startAdminSignIn('/admin')

      const url = sentUrl()
      expect(url.origin + url.pathname).toBe('https://id.twitch.tv/oauth2/authorize')
      expect(url.searchParams.get('client_id')).toBe('test-client-id')
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/')
      expect(url.searchParams.get('response_type')).toBe('token')
      expect(url.searchParams.get('force_verify')).toBe('true')
      expect(url.searchParams.has('scope')).toBe(true)
      expect(url.searchParams.get('scope')).toBe('')
      expect(url.searchParams.get('state')).toMatch(/^admin\.[0-9a-f]{32}$/)
    })

    it('remembers its state and where to come back to, and leaves the viewer sign-in alone', async () => {
      const { startAdminSignIn } = await loadAdminAuth()

      startAdminSignIn('/admin/security')

      expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_OAUTH_STATE)).toBe(sentUrl().searchParams.get('state'))
      expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_RETURN)).toBe('/admin/security')
      expect(localStorage.getItem(VIEWER_TOKEN_KEY)).toBeNull()
      expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_TWITCH_OAUTH_STATE)).toBeNull()
    })

    it.each([['https://evil.example'], ['/admin/../x'], ['//evil.example'], ['/admin/x/y'], ['/administrator'], ['']])(
      'does not accept %s as a place to return to',
      async (path) => {
        const { startAdminSignIn } = await loadAdminAuth()

        startAdminSignIn(path)

        expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_RETURN)).toBe('/admin')
      },
    )

    it('does nothing without a client id', async () => {
      const { startAdminSignIn } = await loadAdminAuth('')

      startAdminSignIn('/admin')

      expect(window.location.href).toBe('http://localhost:5173/')
      expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_OAUTH_STATE)).toBeNull()
    })
  })

  describe('finishAdminSignIn', () => {
    const arrive = (hash: string, saved: string | null = 'admin.abc', ret = '/admin/tt') => {
      setLocation({ hash })
      if (saved !== null) sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_OAUTH_STATE, saved)
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_RETURN, ret)
    }

    it('keeps the token under the admin key only, and sends the owner back to where they were', async () => {
      const { finishAdminSignIn, getAdminToken } = await loadAdminAuth()
      arrive('#access_token=tok123&scope=&state=admin.abc&token_type=bearer')

      finishAdminSignIn()

      expect(getAdminToken()).toBe('tok123')
      expect(localStorage.getItem(VIEWER_TOKEN_KEY)).toBeNull()
      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/admin/tt')
      expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_OAUTH_STATE)).toBeNull()
      expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_RETURN)).toBeNull()
    })

    it.each([
      ['a different state', '#access_token=tok123&state=admin.other', 'admin.abc'],
      ['no pending state', '#access_token=tok123&state=admin.abc', null],
    ])('stores nothing for %s, but still strips the address', async (_name, hash, saved) => {
      const { finishAdminSignIn, getAdminToken } = await loadAdminAuth()
      arrive(hash, saved)

      finishAdminSignIn()

      expect(getAdminToken()).toBeNull()
      expect(localStorage.getItem(VIEWER_TOKEN_KEY)).toBeNull()
      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/admin/tt')
    })

    it.each([
      ['an ordinary viewer sign-in', '#access_token=viewertok&state=0123456789abcdef0123456789abcdef'],
      ['a callback with no state at all', '#access_token=tok'],
      ['an in-page anchor', '#section'],
      ['nothing', ''],
    ])('leaves %s alone', async (_name, hash) => {
      const { finishAdminSignIn, getAdminToken } = await loadAdminAuth()
      arrive(hash, null, '/admin')

      finishAdminSignIn()

      expect(getAdminToken()).toBeNull()
      expect(window.history.replaceState).not.toHaveBeenCalled()
      expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_RETURN)).toBe('/admin')
    })

    it('drops the pending sign-in when the owner declines on Twitch', async () => {
      const { finishAdminSignIn, getAdminToken } = await loadAdminAuth()
      setLocation({ search: '?error=access_denied&error_description=The+user+denied+you+access&state=admin.abc' })
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_OAUTH_STATE, 'admin.abc')
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_RETURN, '/admin')

      finishAdminSignIn()

      expect(getAdminToken()).toBeNull()
      expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_OAUTH_STATE)).toBeNull()
      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/admin')
    })
  })

  describe('endAdminSession (Sign out)', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('asks Twitch to revoke the token, so a copy of it stops working, and then forgets it', async () => {
      const { endAdminSession, getAdminToken } = await loadAdminAuth()
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_TOKEN, 'adm123')

      endAdminSession()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://id.twitch.tv/oauth2/revoke')
      expect(init.method).toBe('POST')
      expect(init.mode).toBe('no-cors') // the answer is never read, so no cross-origin rules apply
      expect(init.credentials).toBe('omit')
      const form = new URLSearchParams(String(init.body))
      expect(form.get('client_id')).toBe('test-client-id')
      expect(form.get('token')).toBe('adm123')
      expect(getAdminToken()).toBeNull()
    })

    it.each([
      ['the request is rejected', () => fetchMock.mockRejectedValue(new TypeError('network down'))],
      ['fetch throws at once', () => fetchMock.mockImplementation(() => { throw new TypeError('no fetch') })],
    ])('still forgets the token when %s', async (_name, breakFetch) => {
      const { endAdminSession, getAdminToken } = await loadAdminAuth()
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_TOKEN, 'adm123')
      breakFetch()

      expect(() => endAdminSession()).not.toThrow()
      await Promise.resolve()

      expect(getAdminToken()).toBeNull()
    })

    it('has nothing to revoke without a token, and leaves the viewer token alone', async () => {
      const { endAdminSession } = await loadAdminAuth()
      localStorage.setItem(VIEWER_TOKEN_KEY, 'viewer')

      endAdminSession()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(localStorage.getItem(VIEWER_TOKEN_KEY)).toBe('viewer')
    })
  })

  describe('the stored token', () => {
    it('is read back and can be cleared, without touching the viewer token', async () => {
      const { getAdminToken, clearAdminToken } = await loadAdminAuth()
      localStorage.setItem(VIEWER_TOKEN_KEY, 'viewer')
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_TOKEN, 'adm')

      expect(getAdminToken()).toBe('adm')
      clearAdminToken()

      expect(getAdminToken()).toBeNull()
      expect(localStorage.getItem(VIEWER_TOKEN_KEY)).toBe('viewer')
    })
  })
})
