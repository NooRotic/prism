# PRISM helper (spike, throwaway)

A tiny Chrome extension that reads two lists out of pages you are already signed in to, because neither is available through an API:

| Page | What it reads | Why |
|---|---|---|
| `twitch.tv` (any page) | Recommended live channels: the side bar's "Live Channels" section plus the home page shelf "Live channels we think you'll like" | Twitch has no recommendations API |
| `youtube.com/playlist?list=WL` | Every Watch Later video id (it scrolls the page until the list stops growing) | The YouTube Data API returns Watch Later empty |

A small button at the bottom right ("PRISM: copy my list") copies the result as JSON to your clipboard. **Nothing is sent anywhere yet**; handing the list to PRISM is the next step.

## Load it (about 2 minutes, no store, no review)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `extension/` folder.
4. Open `https://www.twitch.tv/` or `https://www.youtube.com/playlist?list=WL`, signed in, and click the green button.

After editing `content.js`, click the reload arrow on the extension's card and refresh the page.

## What was found on 2026-11-18 (owner's signed-in Chrome)

- Twitch home: 6 recommended channels in the side bar plus a shelf. The shelf is a carousel that keeps only about 3 cards in the page at a time, so expect about 9 unique channels in total.
- Watch Later: 100 unique video links in the page on load; more after scrolling (the script scrolls).
- The reader was checked against the live pages by running its functions in the page; the extension itself had not been loaded when this was written.

## Known fragility

Twitch and YouTube change their markup without notice. The selectors in `content.js` (`.side-nav-section[aria-label="Live Channels"]`, the shelf heading text, `ytd-playlist-video-renderer`) are the first suspects if a count drops to 0.

## Not built (backlog item 19)

Getting the list into PRISM (URL hand-off, or messaging between the extension and the PRISM page), a "Send to PRISM" and right-click "Open in PRISM", a design doc, tests, and any publishing. This branch is a spike: keeping it means a design doc first.
