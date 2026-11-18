// Reads two lists out of pages the owner is already signed in to and hands them to PRISM (see handoff.js).
//   twitch.tv                       -> the recommended live channels (side bar "Live Channels" and the home shelf "Live channels we think you'll like")
//   youtube.com/playlist?list=WL    -> the Watch Later video ids (the Data API cannot read this list)
// A small panel at the bottom right: "Send to PRISM" opens PRISM's /import page with the list (Shift sends it to
// the local dev site instead), "copy" puts the list on the clipboard as JSON. Design: docs/superpowers/specs/2026-11-18-prism-extension-design.md

const SELECTORS_NOTE = 'Twitch and YouTube change their markup: if a count drops to 0, the selectors in content.js are the first suspect.'

const RESERVED = new Set([
  'directory', 'following', 'search', 'settings', 'subscriptions', 'inventory', 'wallet', 'friends', 'drops',
  'downloads', 'jobs', 'turbo', 'store', 'p', 'videos', 'clips', 'popout', 'moderator', 'dashboard', 'u',
  'team', 'prime', 'login', 'signup', 'messages', 'broadcast',
])

/** A channel login from a link like https://www.twitch.tv/somechannel, or null for anything else (directory, settings...). */
function channelLogin(a) {
  let path
  try {
    path = new URL(a.href, location.origin).pathname
  } catch {
    return null
  }
  const m = path.match(/^\/([A-Za-z0-9_]{2,25})\/?$/)
  if (!m) return null
  const login = m[1].toLowerCase()
  return RESERVED.has(login) ? null : login
}

function unique(list) {
  return [...new Set(list)]
}

/** The side bar shows 6 recommended channels until "Show More" is pressed (10 after one press); press it until it is gone. */
async function expandLiveChannels() {
  for (let i = 0; i < 6; i++) {
    const more = document.querySelector('.side-nav-section[aria-label="Live Channels"] button[data-a-target="side-nav-show-more-button"]')
    if (!more) return
    more.click()
    await new Promise((r) => setTimeout(r, 1200))
  }
}

async function twitchRecommended() {
  await expandLiveChannels()
  const side = [...document.querySelectorAll('.side-nav-section[aria-label="Live Channels"] a[href^="/"]')]
    .map(channelLogin)
    .filter(Boolean)

  // The home page shelf. Find its heading, then climb until the block holds a few links.
  let shelf = []
  const heading = [...document.querySelectorAll('h2, h3')].find((h) => h.innerText.trim().startsWith('Live channels we think'))
  if (heading) {
    let root = heading.parentElement
    // Climb until the block holds the whole shelf, but never into a block that contains the side bar (it lists followed channels).
    for (let i = 0; i < 10 && root && root.querySelectorAll('a[href^="/"]').length < 6; i++) {
      if (root.parentElement && root.parentElement.querySelector('.side-nav-section')) break
      root = root.parentElement
    }
    if (root) shelf = [...root.querySelectorAll('a[href^="/"]')].map(channelLogin).filter(Boolean)
  }
  return { sidebar: unique(side), shelf: unique(shelf), all: unique([...side, ...shelf]) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The Watch Later page loads about 100 rows at a time; scroll to the bottom until the row count stops growing. */
async function watchLaterIds() {
  let last = -1
  let steady = 0
  for (let i = 0; i < 80 && steady < 3; i++) {
    window.scrollTo(0, document.documentElement.scrollHeight)
    await sleep(900)
    const n = document.querySelectorAll('ytd-playlist-video-renderer').length
    steady = n === last ? steady + 1 : 0
    last = n
  }
  window.scrollTo(0, 0)
  const ids = [...document.querySelectorAll('ytd-playlist-video-renderer a[href*="/watch?v="]')]
    .map((a) => new URL(a.href).searchParams.get('v'))
    .filter(Boolean)
  return unique(ids)
}

function isWatchLaterPage() {
  return location.hostname === 'www.youtube.com' && location.pathname === '/playlist' && new URLSearchParams(location.search).get('list') === 'WL'
}

async function collect() {
  if (location.hostname === 'www.twitch.tv') {
    const t = await twitchRecommended()
    return { source: 'twitch-recommended', count: t.all.length, items: t.all, detail: t, at: new Date().toISOString() }
  }
  if (isWatchLaterPage()) {
    const ids = await watchLaterIds()
    return { source: 'youtube-watch-later', count: ids.length, items: ids, at: new Date().toISOString() }
  }
  return null
}

function styleButton(b, primary) {
  b.style.cssText =
    'padding:8px 12px;border-radius:6px;font:12px monospace;cursor:pointer;border:1px solid #39ff14;' +
    (primary ? 'background:#39ff14;color:#111;' : 'background:#111;color:#39ff14;')
}

/** Read the list, then run `use(result)`; shows progress on the button and always restores its label. */
function wire(button, label, use) {
  button.textContent = label
  button.addEventListener('click', async (event) => {
    button.disabled = true
    button.textContent = 'reading…'
    try {
      const result = await collect()
      if (!result) button.textContent = 'nothing to read here'
      else if (result.count === 0) button.textContent = 'found 0 (page layout changed?)'
      else button.textContent = await use(result, event)
    } catch (err) {
      button.textContent = 'failed (see console)'
      console.error('[PRISM helper]', err)
    } finally {
      button.disabled = false
      setTimeout(() => (button.textContent = label), 4000)
    }
  })
}

function addPanel() {
  if (document.getElementById('prism-helper')) return
  const panel = document.createElement('div')
  panel.id = 'prism-helper'
  panel.title = SELECTORS_NOTE
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:6px'

  const send = document.createElement('button')
  styleButton(send, true)
  wire(send, 'Send to PRISM', async (result, event) => {
    const kind = result.source === 'twitch-recommended' ? 'twitch-recommended' : 'watch-later'
    const url = PrismHandoff.importUrl(kind, result.items, event.shiftKey)
    if (!url) return 'nothing valid to send'
    await chrome.runtime.sendMessage({ type: 'open', url })
    return `sent ${result.count}`
  })

  const copy = document.createElement('button')
  styleButton(copy, false)
  wire(copy, 'copy', async (result) => {
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    return `copied ${result.count}`
  })

  panel.append(send, copy)
  document.body.appendChild(panel)
}

addPanel()
