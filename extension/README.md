# PRISM helper (Chrome extension)

Reads two lists out of pages you are already signed in to, because neither is available through an API, and sends them to PRISM:

| Page | What it reads | Where it goes in PRISM |
|---|---|---|
| `twitch.tv` (any page) | Twitch's recommended live channels: the side bar's "Live Channels" (the script presses "Show More", so 10) plus the home page shelf (about 3 more, home page only) | A "Recommended by Twitch" row on `/twitch` |
| `youtube.com/playlist?list=WL` | Every Watch Later video id (it scrolls the page until the list stops growing) | The W lane of the Catch up page (`/youtube/catchup`) |

Design: `docs/superpowers/specs/2026-11-18-prism-extension-design.md`. Browser-only: nothing goes to a server. The list travels in the address fragment of PRISM's `/import` page, which browsers never send over the network.

## Load it (about 2 minutes, no store, no review)

1. Open `chrome://extensions` in Chrome and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this `extension/` folder.
3. Open `https://www.twitch.tv/` (the home page gives the most) or `https://www.youtube.com/playlist?list=WL`, signed in.
4. Click the green **Send to PRISM** button at the bottom right. PRISM opens on its **Import** page, shows what was sent, and saves it only when you press **Save**.

- **Shift-click** Send to PRISM to send to the local dev site (`http://localhost:5000`) instead of `prism.nooroticx.tv`.
- The small **copy** button puts the list on the clipboard as JSON (useful for checking what was read).
- After changing any file here, click the reload arrow on the extension's card and refresh the page.

## Files

- `manifest.json`: Manifest V3, content script on twitch.tv and the YouTube playlist page, a background worker.
- `content.js`: reads the lists and draws the buttons.
- `handoff.js`: builds the `/import#...` address and decides which addresses the worker may open. Loaded by both the content script and the worker, and by PRISM's tests (`src/lib/__tests__/extensionHandoff.test.ts`), which pin the format to PRISM's parser (`src/lib/extensionImport.ts`).
- `background.js`: opens the PRISM tab (only `/import` on the live site or localhost). A worker does this because reading a long Watch Later list takes longer than the browser's click-permission window.
- `package.json`: only tells Node these are classic scripts (so tests can load `handoff.js`); Chrome ignores it.

## Known fragility

Twitch and YouTube change their markup without notice. If a button reports "found 0", the selectors in `content.js` (`.side-nav-section[aria-label="Live Channels"]`, the shelf heading text, `ytd-playlist-video-renderer`) are the first suspects.

## Not built

Right-click "Open in PRISM", live-now status on the recommended row, a Chrome Web Store release, and automatic refresh of either list.
