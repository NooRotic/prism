import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * `loginWithTwitch` reads VITE_TWITCH_CLIENT_ID once, when the module loads, so
 * each test stubs the env var and imports a fresh copy of the module. (That also
 * keeps these tests independent of whatever a developer has in a local .env.)
 */
async function loadAuth() {
  vi.stubEnv('VITE_TWITCH_CLIENT_ID', 'test-client-id')
  vi.resetModules()
  return import('../twitchAuth')
}

/** The `state` query parameter of the Twitch authorize URL the page navigated to. */
function sentState(): string | null {
  return new URL(window.location.href).searchParams.get('state')
}

describe('loginWithTwitch: the OAuth state (CSRF token)', () => {
  beforeEach(() => {
    localStorage.clear()
    // setup.ts backs localStorage and sessionStorage with one mock, so this clears both.

    // jsdom cannot navigate; give the code a plain object it can assign `href` to.
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        href: 'http://localhost:5173/',
        hash: '',
        hostname: 'localhost',
        pathname: '/',
        search: '',
        origin: 'http://localhost:5173',
      },
    })
    window.history.replaceState = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('is drawn from the browser secure random source, at least 128 bits, never Math.random', async () => {
    const getRandomValues = vi.spyOn(globalThis.crypto, 'getRandomValues')
    const mathRandom = vi.spyOn(Math, 'random')
    const { loginWithTwitch } = await loadAuth()

    loginWithTwitch()

    expect(getRandomValues).toHaveBeenCalled()
    const asked = getRandomValues.mock.calls[0][0] as ArrayBufferView
    expect(ArrayBuffer.isView(asked)).toBe(true)
    expect(asked.byteLength).toBeGreaterThanOrEqual(16)
    expect(mathRandom).not.toHaveBeenCalled()
  })

  it('sends Twitch the same value it saves for checking the callback', async () => {
    const { loginWithTwitch } = await loadAuth()

    loginWithTwitch()

    const sent = sentState()
    expect(sent).toBeTruthy()
    expect(sessionStorage.getItem('twitch_oauth_state')).toBe(sent)
  })

  it('is different on every login', async () => {
    const { loginWithTwitch } = await loadAuth()

    loginWithTwitch()
    const first = sentState()
    loginWithTwitch()
    const second = sentState()

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
  })

  it('round-trips: the callback that echoes the sent state is accepted', async () => {
    const { loginWithTwitch, handleTwitchRedirect } = await loadAuth()

    loginWithTwitch()
    window.location.hash = `#access_token=token_xyz&state=${sentState()}&token_type=bearer`

    expect(handleTwitchRedirect()).toBe('token_xyz')
  })
})
