# PRISM helper (Chrome extension)

Three jobs:

| What | Where | Result in PRISM |
|---|---|---|
| **Open in PRISM** (right-click a YouTube or Twitch link or page, or click the toolbar button) | any YouTube video, any Twitch channel | `/youtube/<id>` or `/twitch/<login>` opens in a new tab |
| **Send to PRISM** (a green button) | `twitch.tv`: Twitch's recommended live channels (the side bar's "Live Channels", 10, plus the home shelf, about 3) | A "Recommended by Twitch" row on `/twitch` |
| **Send to PRISM** (a green button) | `youtube.com/playlist?list=WL`: every Watch Later video id (it scrolls until the list stops growing) | The W lane of the Catch up page (`/youtube/catchup`) |

The two lists are read out of pages you are already signed in to, because neither is available through an API.

Design: `docs/superpowers/specs/2026-11-18-prism-extension-design.md`. Browser-only: nothing goes to a server. The list travels in the address fragment of PRISM's `/import` page, which browsers never send over the network.

## Load it (about 2 minutes, no store, no review)

1. Open `chrome://extensions` in Chrome and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `extension/` folder (or the folder you unzipped `prism-helper-<version>.zip` into).
3. Pin it from the puzzle-piece menu if you want the toolbar button.

Using it:
- **Open in PRISM:** right-click a YouTube or Twitch link (or the page itself) and choose "Open in PRISM", or click the toolbar button on a YouTube video or Twitch channel. On any other page the button shows a short "x". **Shift-click** the toolbar button for the local dev site (`http://localhost:5000`).
- **Send to PRISM:** open `https://www.twitch.tv/` (the home page gives the most) or `https://www.youtube.com/playlist?list=WL`, signed in, and click the green **Send to PRISM** button at the bottom right. PRISM opens on its **Import** page, shows what was sent, and saves it only when you press **Save**. Shift-click it for the dev site. The small **copy** button puts the list on the clipboard as JSON (useful for checking what was read).
- After changing any file here, click the reload arrow on the extension's card and refresh the page.

## Other Chrome profiles

An extension is installed per profile, and Chrome has no way to install an unpacked one into all of them. Pick one:

- **Same folder, every profile (works today):** in each profile open `chrome://extensions`, turn on Developer mode, **Load unpacked**, choose the same folder. Keep that folder where it is; Chrome reads it from there. To update, change the files and press the reload arrow in each profile.
- **Zip:** `pnpm run pack:extension` writes `dist-extension/prism-helper-<version>.zip` (only the files Chrome needs). Unzip it somewhere permanent and load that folder as above, on this or another computer.
- **Chrome Web Store, unlisted (one install link for every profile, updates on their own):** needs a developer account (a one-time US$5 fee, paid by the owner), the zip above, and the text in `STORE.md`. Set visibility to "Unlisted" so only people with the link can find it. A profile signed in to Google then installs it with one click, and it follows that account across computers.

## Files

- `manifest.json`: Manifest V3, content script on twitch.tv and the YouTube playlist page, a background worker, the toolbar button and icons (`icons/`). Permissions: `contextMenus` and `activeTab` only; no host access.
- `content.js`: reads the lists and draws the buttons.
- `handoff.js`: builds the `/import#...` address, maps a YouTube or Twitch address to PRISM's `/youtube/<id>` or `/twitch/<login>` (`playPath`, `playUrl`), and decides which addresses the worker may open (`isPrismOpenUrl`). Loaded by both the content script and the worker, and by PRISM's tests (`src/lib/__tests__/extensionHandoff.test.ts`), which pin the format to PRISM's parser (`src/lib/extensionImport.ts`).
- `background.js`: opens the PRISM tab for all three jobs (only PRISM's `/import`, `/youtube/<id>` and `/twitch/<login>` on the live site or localhost). A worker does this because reading a long Watch Later list takes longer than the browser's click-permission window.
- `package.json`: only tells Node these are classic scripts (so tests can load `handoff.js`); Chrome ignores it.

## Known fragility

Twitch and YouTube change their markup without notice. If a button reports "found 0", the selectors in `content.js` (`.side-nav-section[aria-label="Live Channels"]`, the shelf heading text, `ytd-playlist-video-renderer`) are the first suspects.

## Not built

Twitch VODs and clips (PRISM has no direct address for them), live-now status on the recommended row, and automatic refresh of either list. The store listing is not submitted: see "Other Chrome profiles".
