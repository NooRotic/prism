const CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID || ''
const SCOPES = ['user:read:follows']

/**
 * Get the OAuth redirect URI.
 * For dev: http://localhost:5173/twitch-glaze-me/
 * For prod: https://<user>.github.io/twitch-glaze-me/
 *
 * Must exactly match what's registered in Twitch Developer Console.
 */
function getRedirectUri(): string {
  // Use the base URL (origin + vite base path)
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
