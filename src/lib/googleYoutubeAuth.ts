/**
 * One-time, read-only Google sign-in for the Catch up page. Uses Google Identity Services' token client:
 * a popup, no redirect page, no client secret, and an access token that lives about an hour. The caller uses it
 * once (to import subscriptions) and drops it, so nothing here is ever stored.
 */
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'
const GSI_SRC = 'https://accounts.google.com/gsi/client'

export type GoogleAuthReason = 'denied' | 'closed' | 'unconfigured' | 'load'

export class GoogleAuthError extends Error {
  constructor(
    public reason: GoogleAuthReason,
    message: string,
  ) {
    super(message)
    this.name = 'GoogleAuthError'
  }
}

interface TokenResponse {
  access_token?: string
  error?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string }) => void
          }): TokenClient
        }
      }
    }
  }
}

function clientId(): string {
  return ((import.meta.env.VITE_YOUTUBE_CLIENT_ID as string | undefined) ?? '').trim()
}

export function isGoogleAuthConfigured(): boolean {
  return clientId() !== ''
}

let loading: Promise<void> | null = null

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GSI_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      s.remove()
      reject(new GoogleAuthError('load', 'Could not load Google sign-in'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** Ask the owner for read-only YouTube access. Resolves with an access token; rejects with a GoogleAuthError. */
export async function requestYoutubeReadToken(): Promise<string> {
  const id = clientId()
  if (!id) throw new GoogleAuthError('unconfigured', 'VITE_YOUTUBE_CLIENT_ID is not set')
  await loadGsi()
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: (r) => {
        if (r.access_token) resolve(r.access_token)
        else reject(new GoogleAuthError('denied', r.error ?? 'Google sign-in was declined'))
      },
      error_callback: (e) => {
        reject(
          e.type === 'popup_closed'
            ? new GoogleAuthError('closed', 'The Google sign-in window was closed')
            : new GoogleAuthError('denied', `Google sign-in failed (${e.type})`),
        )
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}
