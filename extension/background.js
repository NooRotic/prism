// Opens PRISM's /import page for the content script. A service worker does this (not window.open in the page)
// because reading a long Watch Later list takes longer than the browser's click-permission window.
importScripts('handoff.js')

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'open' && typeof message.url === 'string' && PrismHandoff.isPrismImportUrl(message.url)) {
    chrome.tabs.create({ url: message.url })
  }
})
