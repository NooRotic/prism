/**
 * Reads the address the PRISM helper extension opens (`/import#v=1&kind=...`). The sender is not trusted: this is
 * a link anyone can craft, so every entry is checked and capped here, and the page asks the owner before saving.
 * The format is defined by extension/handoff.js; extensionHandoff.test.ts pins the two together.
 */
export type ImportPayload =
  | { kind: 'watch-later'; ids: string[] }
  | { kind: 'twitch-recommended'; logins: string[] }

const VIDEO_ID = /^[\w-]{11}$/
const LOGIN = /^[a-z0-9_]{2,25}$/
const MAX_IDS = 2000
const MAX_LOGINS = 60

function pick(raw: string | null, test: RegExp, max: number): string[] {
  const out: string[] = []
  for (const part of (raw ?? '').split(',')) {
    const s = part.trim()
    if (test.test(s) && !out.includes(s)) out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** The validated list in a fragment, or null when it is missing, a different version, or holds nothing valid. */
export function parseImportFragment(hash: string): ImportPayload | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  if (params.get('v') !== '1') return null
  const kind = params.get('kind')
  if (kind === 'watch-later') {
    const ids = pick(params.get('ids'), VIDEO_ID, MAX_IDS)
    return ids.length ? { kind, ids } : null
  }
  if (kind === 'twitch-recommended') {
    const logins = pick(params.get('logins'), LOGIN, MAX_LOGINS)
    return logins.length ? { kind, logins } : null
  }
  return null
}
