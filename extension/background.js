// The extension's background worker. Three jobs, all of them "open a tab on PRISM":
//  1. The content script's Send to PRISM button (Twitch recommended / Watch Later): opens PRISM's /import page. A
//     worker does this (not window.open in the page) because reading a long Watch Later list takes longer than the
//     browser's click-permission window.
//  2. The right-click "Open in PRISM" on a YouTube or Twitch link or page.
//  3. The toolbar button: opens the current tab's YouTube video or Twitch channel in PRISM.
// Everything it opens passes PrismHandoff.isPrismOpenUrl: only PRISM's own import and play addresses.
importScripts('handoff.js')

const LINK_MENU = 'prism-open-link'
const PAGE_MENU = 'prism-open-page'

function openInPrism(address, dev) {
  const target = PrismHandoff.playUrl(address || '', dev)
  if (target && PrismHandoff.isPrismOpenUrl(target)) {
    chrome.tabs.create({ url: target })
    return true
  }
  return false
}

// Menus are created once, when the extension is installed or updated.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: LINK_MENU,
      title: 'Open in PRISM',
      contexts: ['link'],
      targetUrlPatterns: ['https://*.youtube.com/*', 'https://youtu.be/*', 'https://*.twitch.tv/*', 'https://twitch.tv/*'],
    })
    chrome.contextMenus.create({
      id: PAGE_MENU,
      title: 'Open this page in PRISM',
      contexts: ['page'],
      documentUrlPatterns: ['https://*.youtube.com/*', 'https://youtu.be/*', 'https://*.twitch.tv/*', 'https://twitch.tv/*'],
    })
  })
})

chrome.contextMenus.onClicked.addListener((info) => {
  openInPrism(info.menuItemId === LINK_MENU ? info.linkUrl : info.pageUrl)
})

// The toolbar button. On a page PRISM has nothing for, a short "x" badge says so instead of doing nothing silently.
chrome.action.onClicked.addListener((tab, info) => {
  // Shift-click opens the local dev site (http://localhost:5000), like the Send to PRISM button.
  const dev = Boolean(info && info.modifiers && info.modifiers.includes('Shift'))
  if (openInPrism(tab && tab.url, dev)) return
  if (tab && tab.id !== undefined) {
    chrome.action.setBadgeText({ tabId: tab.id, text: 'x' })
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 2000)
  }
})

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'open' && typeof message.url === 'string' && PrismHandoff.isPrismOpenUrl(message.url)) {
    chrome.tabs.create({ url: message.url })
  }
})
