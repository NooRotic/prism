// Builds the address that hands a list from the extension to PRISM. A classic script (Chrome content scripts
// cannot import modules), also loadable from Node so PRISM's tests can pin the format.
//
//   <PRISM>/import#v=1&kind=watch-later&ids=<id,id,...>
//   <PRISM>/import#v=1&kind=twitch-recommended&logins=<login,login,...>
//
// The data rides in the fragment, which the browser never sends to a server. PRISM validates it again on its side.
;(function (root) {
  const VIDEO_ID = /^[\w-]{11}$/
  const LOGIN = /^[a-z0-9_]{2,25}$/
  const MAX_IDS = 2000
  const MAX_LOGINS = 60
  const ORIGINS = { prod: 'https://prism.nooroticx.tv', dev: 'http://localhost:5000' }

  const KINDS = {
    'watch-later': { param: 'ids', test: (s) => VIDEO_ID.test(s), norm: (s) => s, max: MAX_IDS },
    'twitch-recommended': { param: 'logins', test: (s) => LOGIN.test(s), norm: (s) => s.toLowerCase(), max: MAX_LOGINS },
  }

  function clean(kind, items) {
    const k = KINDS[kind]
    const out = []
    for (const raw of items) {
      const s = k.norm(String(raw).trim())
      if (k.test(s) && !out.includes(s)) out.push(s)
      if (out.length >= k.max) break
    }
    return out
  }

  /** `#v=1&kind=...&ids=...`, or null when the kind is unknown or no item is valid. */
  function buildFragment(kind, items) {
    if (!KINDS[kind]) return null
    const list = clean(kind, items)
    return list.length === 0 ? null : `#v=1&kind=${kind}&${KINDS[kind].param}=${list.join(',')}`
  }

  /** The full PRISM address, or null. `dev` points at the local dev server instead of the live site. */
  function importUrl(kind, items, dev) {
    const frag = buildFragment(kind, items)
    return frag === null ? null : `${dev ? ORIGINS.dev : ORIGINS.prod}/import${frag}`
  }

  /** True only for `<PRISM origin>/import...`; the background worker refuses to open anything else. */
  function isPrismImportUrl(url) {
    let u
    try {
      u = new URL(url)
    } catch {
      return false
    }
    return (u.origin === ORIGINS.prod || u.origin === ORIGINS.dev) && u.pathname === '/import'
  }

  // --- Opening a page in PRISM (right-click menu and the toolbar button) ---------------------------------------------
  // Only the two kinds PRISM has a page for: a YouTube video (/youtube/<id>) and a Twitch channel (/twitch/<login>).
  const YT_HOSTS = ['www.youtube.com', 'youtube.com', 'm.youtube.com']
  const TWITCH_HOSTS = ['www.twitch.tv', 'twitch.tv', 'm.twitch.tv']
  // First path segments on twitch.tv that are pages, not channels.
  const TWITCH_RESERVED = [
    'directory', 'videos', 'settings', 'downloads', 'p', 'popout', 'embed', 'search', 'subscriptions', 'wallet', 'inventory',
    'friends', 'messages', 'drops', 'turbo', 'jobs', 'store', 'moderator', 'u', 'prime', 'team', 'event', 'schedule', 'broadcast',
    'signup', 'login', 'privacy', 'legal', 'about', 'bits', 'gift', 'payments', 'clips',
  ]

  /** PRISM's path for a YouTube or Twitch address (`/youtube/<id>`, `/twitch/<login>`), or null for anything else. */
  function playPath(url) {
    let u
    try {
      u = new URL(url)
    } catch {
      return null
    }
    if (u.protocol !== 'https:') return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (u.hostname === 'youtu.be') return parts[0] && VIDEO_ID.test(parts[0]) ? `/youtube/${parts[0]}` : null
    if (YT_HOSTS.includes(u.hostname)) {
      if (parts[0] === 'watch') {
        const v = u.searchParams.get('v')
        return v && VIDEO_ID.test(v) ? `/youtube/${v}` : null
      }
      if (['shorts', 'live', 'embed'].includes(parts[0]) && parts[1] && VIDEO_ID.test(parts[1])) return `/youtube/${parts[1]}`
      return null
    }
    if (TWITCH_HOSTS.includes(u.hostname)) {
      const login = (parts[0] || '').toLowerCase()
      return LOGIN.test(login) && !TWITCH_RESERVED.includes(login) ? `/twitch/${login}` : null
    }
    return null
  }

  /** The full PRISM address for a YouTube or Twitch address, or null. `dev` points at localhost. */
  function playUrl(url, dev) {
    const path = playPath(url)
    return path === null ? null : `${dev ? ORIGINS.dev : ORIGINS.prod}${path}`
  }

  /** True for a PRISM import address or a PRISM play address; the background worker refuses to open anything else. */
  function isPrismOpenUrl(url) {
    if (isPrismImportUrl(url)) return true
    let u
    try {
      u = new URL(url)
    } catch {
      return false
    }
    return (u.origin === ORIGINS.prod || u.origin === ORIGINS.dev) && /^\/(youtube\/[\w-]{11}|twitch\/[a-z0-9_]{2,25})$/.test(u.pathname)
  }

  const api = { buildFragment, importUrl, isPrismImportUrl, playPath, playUrl, isPrismOpenUrl, ORIGINS }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.PrismHandoff = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
