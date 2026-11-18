# PRISM helper extension: hand-off design (short)

Status: written 2026-11-18 when the owner said "start extension build"; the owner has not reviewed the choices below, so they are proposals (marked **my call**). Backlog item 19. Browser-only, nothing stored on a server.

## Intent

Two lists the owner wants inside PRISM cannot be reached through any API:

- **YouTube Watch Later** (the Data API returns it empty). It feeds the Catch up page's W lane, replacing hand-pasted links.
- **Twitch's own recommended live channels** (Twitch has no recommendations API; the owner misses the feature). It feeds a "Recommended" row on PRISM's Twitch page.

A small Chrome extension reads each list from the page the owner is already signed in to (the spike on this branch proved both: 546 Watch Later ids, 13 recommended channels) and hands it to PRISM.

## Goals / non-goals

- Goals: one click from twitch.tv or the Watch Later page to PRISM with the list imported; works unpacked, no store; PRISM gives the owner a confirmation before anything is stored.
- Non-goals: no server, no accounts, no sync, no Chrome Web Store release, no reading anything but those two lists, no live-now popup, no right-click menu (later).
- Anti-goal: a crafted link must not be able to push junk into someone's PRISM without them seeing it.

## Approaches considered

| | Approach | Verdict |
|---|---|---|
| A | The extension opens PRISM at `/import#<data>`; PRISM reads the fragment | **Chosen (my call).** Needs nothing on the PRISM side but a page. The fragment is never sent to any server. |
| B | A content script on PRISM's own pages talks to the extension by messages | More moving parts, needs host permission for PRISM and a handshake. Not needed for lists of ids. |
| C | Copy JSON to the clipboard, paste into PRISM | The spike's behaviour. Works, but it is the manual step we are removing. Kept as a fallback button. |

## Design

**Fragment format (my call).** `#v=1&kind=watch-later&ids=<id,id,...>` or `#v=1&kind=twitch-recommended&logins=<login,login,...>`. Ids are 11-character video ids; logins are Twitch login names (`[a-z0-9_]{2,25}`). 546 ids is about 6.6 KB, far under Chrome's URL limit.

**Extension.**
- A shared classic script `handoff.js` builds the fragment and holds the validation rules, so the same rules can be tested from PRISM's test suite.
- `content.js` reads the list and sends `{ type: 'open', url }` to `background.js`, which opens the tab (a service worker opens it, because reading 546 Watch Later rows takes longer than the browser's click-permission window, which would block `window.open`). The worker only opens URLs on PRISM's two origins.
- PRISM origin: `https://prism.nooroticx.tv`; holding **Shift** while clicking sends to `http://localhost:5000` for development (my call).
- The copy-JSON path stays as a second small button.

**PRISM.**
- `src/lib/extensionImport.ts`: `parseImportFragment(hash)` returns a validated payload or null. Strict: bad ids and logins are dropped, duplicates removed, caps of 2000 ids and 60 logins.
- `/import` page (inside the layout): shows "The PRISM helper sent 546 Watch Later videos" with **Save** and **Dismiss**; nothing is stored until Save (the anti-goal). Save writes through the existing `setWatchLater` or a new recommended-channels store, clears the fragment, and goes to `/youtube/catchup` or `/twitch`.
- `src/lib/recommendedStore.ts`: `prism_twitch_recommended` = `{ logins, importedAt }` in localStorage.
- A "Recommended by Twitch" row at the top of the Twitch page (`ProtocolPage`, twitch only), shown only when something was imported: channel links to `/twitch/<login>`, the import date, and a Clear button. No live status in this version.

## Left to the builder

Exact copy and styling (follow existing cards and tokens), error and empty states, mobile layout.

## Known fragility

Twitch and YouTube change their markup; if a count drops to zero the selectors in `content.js` are the first suspect. The extension is installed unpacked from `extension/` (steps in `extension/README.md`).
