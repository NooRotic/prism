import { STORAGE_KEYS } from '../config/storageKeys'
import { logger } from './logger'
import { getRedirectUri } from './twitchAuth'

const CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID || ''

/**
 * The admin sign-in is a second, separate Twitch authorisation: no permissions (identity only), its own state
 * values (always starting with this prefix, so a callback is never mistaken for a viewer's), and its token in
 * sessionStorage under its own key. PRISM's regular viewer token, which carries nine permissions, is never
 * involved and never sent to the admin side of the history server.
 */
export const ADMIN_STATE_PREFIX = 'admin.'

/** The only pages a sign-in may send the owner back to: /admin and its screens, nothing else. */
const RETURN_PATTERN = /^\/admin(\/[a-z]+)?$/
const DEFAULT_RETURN = '/admin'

function createAdminState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return ADMIN_STATE_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Starts the admin sign-in. `force_verify` makes Twitch show its authorise screen every time, even to someone
 * who has already authorised PRISM: that click is the deliberate act that counts as "trying" to the server.
 * Twitch returns to the registered address (the site root), so the page to come back to is remembered first.
 */
export function startAdminSignIn(returnPath: string): void {
  if (!CLIENT_ID) {
    logger.error('VITE_TWITCH_CLIENT_ID is not set. Create a .env file from .env.example.')
    return
  }

  const state = createAdminState()
  sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_OAUTH_STATE, state)
  sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_RETURN, RETURN_PATTERN.test(returnPath) ? returnPath : DEFAULT_RETURN)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'token',
    scope: '',
    force_verify: 'true',
    state,
  })
  window.location.href = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`
}

/**
 * Called once at startup, before React renders. Takes the admin sign-in's callback (and only that: a callback
 * whose state does not start with `admin.` is a viewer's and is left for the viewer sign-in), keeps the token
 * if the state matches the one this tab started, cleans the address and moves to the page the owner came
 * from. A declined or tampered callback stores nothing.
 */
export function finishAdminSignIn(): void {
  const hash = new URLSearchParams(window.location.hash.substring(1))
  const query = new URLSearchParams(window.location.search)
  const state = hash.get('state') ?? query.get('state')
  if (!state || !state.startsWith(ADMIN_STATE_PREFIX)) return

  const savedState = sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_OAUTH_STATE)
  const storedReturn = sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_RETURN)
  const returnPath = storedReturn !== null && RETURN_PATTERN.test(storedReturn) ? storedReturn : DEFAULT_RETURN

  const token = hash.get('access_token')
  if (token && savedState && state === savedState) {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_TOKEN, token)
  } else if (token) {
    logger.error('Admin sign-in state mismatch: the callback was ignored')
  }

  sessionStorage.removeItem(STORAGE_KEYS.SESSION_ADMIN_OAUTH_STATE)
  sessionStorage.removeItem(STORAGE_KEYS.SESSION_ADMIN_RETURN)
  window.history.replaceState(null, '', returnPath)
}

export function getAdminToken(): string | null {
  return sessionStorage.getItem(STORAGE_KEYS.SESSION_ADMIN_TOKEN)
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(STORAGE_KEYS.SESSION_ADMIN_TOKEN)
}
