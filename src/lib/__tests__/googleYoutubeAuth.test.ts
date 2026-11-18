import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleAuthError, isGoogleAuthConfigured, requestYoutubeReadToken } from '../googleYoutubeAuth'

interface TokenConfig {
  client_id: string
  scope: string
  callback: (r: { access_token?: string; error?: string }) => void
  error_callback: (e: { type: string }) => void
}

let captured: TokenConfig | null
let requestArgs: unknown

function stubGoogle(behave: (cfg: TokenConfig) => void) {
  captured = null
  ;(window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: TokenConfig) => {
          captured = cfg
          return {
            requestAccessToken: (args: unknown) => {
              requestArgs = args
              behave(cfg)
            },
          }
        },
      },
    },
  }
}

beforeEach(() => vi.stubEnv('VITE_YOUTUBE_CLIENT_ID', 'abc.apps.googleusercontent.com'))
afterEach(() => {
  vi.unstubAllEnvs()
  delete (window as unknown as { google?: unknown }).google
  document.head.querySelectorAll('script[src*="gsi/client"]').forEach((s) => s.remove())
})

describe('googleYoutubeAuth', () => {
  it('reports whether a client id is configured', () => {
    expect(isGoogleAuthConfigured()).toBe(true)
    vi.stubEnv('VITE_YOUTUBE_CLIENT_ID', '')
    expect(isGoogleAuthConfigured()).toBe(false)
  })

  it('resolves with the access token, asking for read-only YouTube access', async () => {
    stubGoogle((cfg) => cfg.callback({ access_token: 'tok123' }))
    await expect(requestYoutubeReadToken()).resolves.toBe('tok123')
    expect(captured!.client_id).toBe('abc.apps.googleusercontent.com')
    expect(captured!.scope).toBe('https://www.googleapis.com/auth/youtube.readonly')
    expect(requestArgs).toEqual({ prompt: '' })
  })

  it('maps an access_denied response to reason "denied"', async () => {
    stubGoogle((cfg) => cfg.callback({ error: 'access_denied' }))
    await expect(requestYoutubeReadToken()).rejects.toMatchObject({ name: 'GoogleAuthError', reason: 'denied' })
  })

  it('maps a closed popup to reason "closed"', async () => {
    stubGoogle((cfg) => cfg.error_callback({ type: 'popup_closed' }))
    const err = await requestYoutubeReadToken().catch((e) => e)
    expect(err).toBeInstanceOf(GoogleAuthError)
    expect(err.reason).toBe('closed')
  })

  it('rejects "unconfigured" without a client id', async () => {
    vi.stubEnv('VITE_YOUTUBE_CLIENT_ID', '')
    stubGoogle(() => {})
    await expect(requestYoutubeReadToken()).rejects.toMatchObject({ reason: 'unconfigured' })
  })

  it('rejects "load" when the Google script cannot be loaded, and can try again afterwards', async () => {
    const p = requestYoutubeReadToken()
    document.head.querySelector('script[src*="gsi/client"]')!.dispatchEvent(new Event('error'))
    await expect(p).rejects.toMatchObject({ reason: 'load' })
    // Not stuck: a second attempt adds a fresh script tag.
    void requestYoutubeReadToken().catch(() => {})
    expect(document.head.querySelectorAll('script[src*="gsi/client"]').length).toBeGreaterThan(0)
  })
})
