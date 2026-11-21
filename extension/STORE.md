# Chrome Web Store listing (draft, not submitted)

Submitting is the owner's step: it needs a developer account (one-time US$5 fee) and accepting Google's developer agreement. Package with `pnpm run pack:extension`, upload `dist-extension/prism-helper-<version>.zip`, set visibility to **Unlisted**.

## Name
PRISM helper

## Summary (132 characters max; this is the manifest description)
Open YouTube videos and Twitch channels in PRISM, and send your Twitch recommendations and YouTube Watch Later into it.

## Description
PRISM (prism.nooroticx.tv) is a stream player for Twitch, YouTube, HLS and DASH. This helper connects your browser to it.

- Right-click any YouTube video or Twitch channel link (or the page itself) and choose "Open in PRISM", or click the toolbar button on a YouTube video or Twitch channel.
- On twitch.tv, a "Send to PRISM" button sends Twitch's recommended live channels to PRISM's Twitch page.
- On your YouTube Watch Later playlist, a "Send to PRISM" button sends the video list to PRISM's Catch up page.

Nothing is sent to a server. The lists travel in the address fragment of PRISM's own import page (browsers never send a fragment over the network), and PRISM asks you before it saves anything.

## Category
Productivity (or Social & Communication)

## Single purpose (the store asks for one)
Open and import YouTube and Twitch content in the PRISM web app.

## Permission justifications
- `contextMenus`: adds the "Open in PRISM" right-click entry on YouTube and Twitch links and pages.
- `activeTab`: lets the toolbar button read the address of the tab you click it on, to open that video or channel in PRISM.
- Content scripts on `https://www.twitch.tv/*` and `https://www.youtube.com/playlist*`: read the visible recommended-channels list and the Watch Later list on those pages, only when you press "Send to PRISM".
- No host permissions, no remote code, no analytics, no accounts.

## Privacy practices
- Collects: nothing. The extension stores no data and makes no network requests of its own.
- Handling: the lists you choose to send are placed in a link that opens prism.nooroticx.tv in a new tab; PRISM validates them and saves them in your own browser's storage only after you confirm.
- Policy URL: the store requires one if any data is handled; use `https://prism.nooroticx.tv` plus a short privacy note on the site (not written yet).

## Screenshots needed (1280x800 or 640x400)
1. The right-click menu on a YouTube link. 2. The "Send to PRISM" button on twitch.tv. 3. PRISM's Import page showing what was sent.
