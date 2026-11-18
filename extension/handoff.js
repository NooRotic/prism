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

  const api = { buildFragment, importUrl, isPrismImportUrl, ORIGINS }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.PrismHandoff = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
