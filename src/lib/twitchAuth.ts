const CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID || ''
const REDIRECT_URI_OVERRIDE = import.meta.env.VITE_TWITCH_REDIRECT_URI || ''

/**
 * Twitch OAuth scopes. Expanded in phase 2 to unlock streamer stats for
 * affiliate/partner channels. Tokens minted before this expansion still
 * work for their original scopes but will 401 on the new endpoints —
 * SessionExpiredError handling cascades that into a logout, forcing a
 * one-time re-auth the next time the user hits a streamer-stats API.
 *
 * Scope rationale:
 * - user:read:follows — Following panel (existing)
 * - moderator:read:followers — streamer's own follower total
 * - channel:read:subscriptions — streamer's subscriber list + tier points
 * - channel:read:goals — active broadcast goals
 * - channel:read:hype_train — recent hype train events
 * - channel:read:vips — VIP list
 * - channel:read:polls — poll history
 * - channel:read:predictions — prediction history
 * - bits:read — bits leaderboard
 */
const SCOPES = [
  'user:read:follows',
  'moderator:read:followers',
  'channel:read:subscriptions',
  'channel:read:goals',
  'channel:read:hype_train',
  'channel:read:vips',
  'channel:read:polls',
  'channel:read:predictions',
  'bits:read',
]

/**
 * Get the OAuth redirect URI.
 *
 * Precedence:
 *   1. VITE_TWITCH_REDIRECT_URI env var (exact string — set this in .env when
 *      the auto-computed value doesn't byte-match the Twitch app registration,
 *      e.g. trailing-slash differences, non-default dev ports, or staging URLs).
 *      When left blank, Twitch falls back to the FIRST URL registered in the
 *      Twitch Developer Console — which is usually the production URL, not
 *      localhost — so the override is required for dev.
 *   2. `window.location.origin + import.meta.env.BASE_URL` as a fallback.
 *      For dev with port 5000: http://localhost:5000/prism/
 *      For prod: https://<user>.github.io/prism/
 *
 * Must exactly match what's registered in Twitch Developer Console.
 */
function getRedirectUri(): string {
  if (REDIRECT_URI_OVERRIDE) return REDIRECT_URI_OVERRIDE
  const base = import.meta.env.BASE_URL || '/'
  return window.location.origin + base
}

export function loginWithTwitch() {
  if (!CLIENT_ID) {
    console.error('VITE_TWITCH_CLIENT_ID is not set. Create a .env file from .env.example.')
    return
  }

  const state = Math.random().toString(36).substring(2)
  sessionStorage.setItem('twitch_oauth_state', state)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    state,
  })
  window.location.href = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`
}

export function handleTwitchRedirect(): string | null {
  const hash = window.location.hash.substring(1)
  if (!hash) return null

  const params = new URLSearchParams(hash)
  const accessToken = params.get('access_token')
  const state = params.get('state')

  // Validate state to prevent CSRF
  const savedState = sessionStorage.getItem('twitch_oauth_state')
  if (state && savedState && state !== savedState) {
    console.warn('OAuth state mismatch — possible CSRF attempt')
    return null
  }

  if (accessToken) {
    localStorage.setItem('twitch_access_token', accessToken)
    sessionStorage.removeItem('twitch_oauth_state')
    // Clean the URL hash without losing the path
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    return accessToken
  }

  return null
}

export function getStoredToken(): string | null {
  return localStorage.getItem('twitch_access_token')
}

export function clearToken() {
  localStorage.removeItem('twitch_access_token')
}

export function isAuthenticated(): boolean {
  return !!getStoredToken()
}
