# Casting: the TV look, sharing by QR code, and the help page

Status: design agreed in conversation with the owner on 2026-11-25; this document waits for the owner's approval. Builds on casting phase 1 (`docs/superpowers/specs/2026-11-25-casting-phase-1-design.md`, PR #137); branch `feat/cast-tv-look` starts from that branch.

Visual reference (throwaway comps the owner approved): `.superpowers/comps/tv-look.html` (banner, ring, guide colours) and `.superpowers/comps/tv-qr.html` (QR styles, the card, the clock, the guide with what is on). They are git-ignored; on the dev server they open at `/.superpowers/comps/<name>.html`.

## Why

The owner tried phase 1 on the Gen 5: "streams are loading and with the remote really starting to resemble a set-top box experience". This round dresses it up and adds what a set-top box has:

- a look that is "techy / cyberpunky", with real information for anyone who understands it: one line of what the player is doing;
- the time ("the corniest thing about set-top boxes ... It's TIME");
- sharing or saving a channel found by flipping, from a phone, with the computer closed: a QR code on the TV ("totally fits me");
- a page for people who open `prism-cast.nooroticx.tv` in a normal browser, explaining PRISM, with buttons to its sections, and a sensible result when someone casts that page from Chrome's menu.

The Cast app will be published soon, so the TV page and the help page will be seen by people other than the owner.

## Goals

1. **Banner** (bottom of the picture, as today):
   - the state word moves above the channel name, in small capitals; while tuning it is the word "Tuning" in rainbow letters whose colours drift very slowly; once playing it turns quiet (dim, e.g. "Live · News"); "Buffering", "Paused", "Not available" as today, placed the same way;
   - under the name, **one line of live player output** in a small monospace font (see "The debug line");
   - *(builder's call, recorded:)* a failed or finished channel keeps phase 1's centred message and its instruction; the debug line goes under that message and may carry Cast's error code (`ERROR 905`): phase 1's "no error codes on screen" gives way to the owner's wish for real information, in the small line only. No clock with it.
   - **PRISM's mark** at the far right.
2. **The rainbow ring**: a faint 2 px ring of colour round the banner, the guide, the "what is on" card and the share card; about 55 % strength; it turns once every 90 seconds, too slowly to notice. The colours are the platforms' (`#9146ff #3b82f6 #22d3ee #39ff14 #ffc832 #ff6b35 #ff0000`). The turning layer is sized to the panel's diagonal, not the comp's 300 % (a full-width banner would otherwise be a ~3,500 px square texture on a Chromecast), and turns with `transform: rotate()` (the separate `rotate` / `translate` properties the comp uses need Chrome 104+, and the Ultra is older).
3. **Platform colours**: on the TV the HLS / DASH page's blue (`#3B82F6`) is the colour of the guide's group name, a small "HLS / DASH" line above it, the selected row's border and fill, and the playing mark. Green leaves the TV page (it will be Kick's). Later platforms bring their own colour to their own guide rows (see the non-goals).
4. **The guide shows what is on.** While the guide is open a "now" card (picture, quiet state word, name, the debug line, the mark) sits at the bottom right, beside the guide. This replaces phase 1's ruling "no banner while the guide is open".
5. **The clock**: small, top right, inside the 5 % margin a TV may cut off, shown only while the guide, the banner or the share card is up. Never alone over the picture (an always-on clock is a burn-in risk on OLED TVs). The device's own time zone and its 12- or 24-hour habit (`Intl.DateTimeFormat` with no locale given); the colon fades slowly on and off.
6. **The share card**: Left or Right with the guide closed (phase 1: those keys did nothing) shows a card on the right: the channel's picture and name, its group and country, a **QR code** for `https://prism.nooroticx.tv/hls-dash/<id>`, and "Scan to watch it on your phone, star it or share it". The page it opens already plays the stream and has the star; sharing is the phone browser's own Share (PRISM has no share button of its own, and the card's words must not suggest one). See "The remote" for the keys.
7. **QR style chosen in `/admin`.** Three styles (from the comp): **A** PRISM's colours deepened on a light card, **B** rainbow on dark, **C** near-black dots with coloured corner squares. All three use round dots at full module size, coloured corner squares, PRISM's mark in the middle and the highest error correction. The owner picked **B** as the default and wants to switch from `/admin`. The TV reads the choice from the history server; with the server unreachable it uses B.
8. **Joining a TV that is already playing.** A sender that connects to the TV while PRISM's TV page has a channel on (tuning, playing, buffering or paused) shows what is on and does not send the page's own stream. Phase 1 sends it in that case, which would retune the TV away from the channel the person wanted to keep. *(Builder's call, recorded:)* an explicit pick still wins, as in phase 1: a card picked or an address pasted while the picker is open or during "Reconnecting to the TV…" is sent. A TV that shows "not available", has finished, or sits on its start screen gets the page's stream as in phase 1. The sender can tell from the media Cast attaches to the joined session (`getSessionObj().media`), with the TV's own `now` message as the fallback; it holds the page's stream back until it knows.
9. **The help page.** `prism-cast.nooroticx.tv` opened anywhere but a Cast device shows a help page instead of the TV page: what PRISM is in a short paragraph, buttons to its sections (Twitch, YouTube, HLS / DASH, each in its platform colour), and "To watch on your TV, open HLS / DASH in Chrome and press the Cast button". It never loads Google's receiver script (today a browser visitor gets the TV's idle screen while that script retries a connection that only exists on a device, every few seconds for as long as the tab is open). Large enough to read on a TV, because casting it from Chrome's menu mirrors the tab: whoever does that sees the same directions on the TV.
10. **The page follows the TV** (owner, 2026-11-26: "if I cast channel X and decide by remote to change to channel D, my prism that casted should update"). While casting, the HLS / DASH page moves to the channel the TV is on, in place (the address is replaced, not added to the history), so its address, About panel and star are the TV's channel. It moves when the TV starts tuning a channel (a remote flip), and on the first word from the TV after the page connects (a phone that joins, a reload). It never tunes the TV. A late word about the channel before a pick made on the page is not a flip, so it does not undo the pick. A pasted address (no id) or a channel the list does not have leaves the page where it is. This replaces phase 1's "a flip by remote changes the panel, not the page's address".

## Non-goals

- Twitch and YouTube rows in the guide (Following, Watch Later, ...). A separate project; it starts with a test on the Gen 5 of whether the TV page can play their embeds at all.
- **The TV page as a set-top box in a TV's own browser** (the owner, 2026-11-25: its own project, next). The same page, guide and remote at `/tv/` in the Gen 5's browser, with PRISM's own player in place of Cast's (the player is already behind the `CastEngine` interface; PRISM's engine started streams faster on the Gen 5 in the race) and the browser's arrow, Enter and Back keys. This round only leaves `/tv/` ready for it.
- A "Cast PRISM" button on the help page that opens PRISM's own TV app (possible once the app is published; the owner will decide then).
- Anything new on the computer's side except the join rule (goal 8) and the admin choice (goal 7).
- Counting shares in Matomo.

## Anti-goals

- A QR code that does not scan. Every style is read back by a decoder in the tests.
- A pasted address (which can carry a token) shown on screen, put in a QR code, or written in the debug line. The share card for a pasted stream has no code and says "Only channels from PRISM's list can be shared from the TV".
- The ring, the rainbow text or the clock making the TV stutter: the ring turns by `transform` only (the GPU moves it; nothing is redrawn), the rainbow text is the one painted animation and runs only while tuning, the debug line updates at most 4 times a second while tuning and once a second while playing.
- The help page loading Google's receiver script, or the TV page failing on a real device because it was taken for a browser.

## The remote

Changes from phase 1 only.

| Key | Guide closed, no card | Share card up | Guide open |
|---|---|---|---|
| Left / Right | opens the share card for what is on | closes it | groups (as today) |
| Up / Down | flip (as today) | closes the card and flips | move (as today) |
| OK | opens the guide (as today) | closes the card, opens the guide | watch (as today) |
| Back | the Back rules (as today) | closes the card (does not arm "press Back again to leave") | closes the guide (as today) |

- The card closes by itself after 30 s.
- Left or Right during a flip preview (the 600 ms before a flip is tuned) tunes that channel at once and opens its card.
- With nothing playing (the start screen) Left and Right do nothing.
- A channel with an id gets its code even when the TV has no list (the link holds only the id). Only a stream with no id (a pasted address) gets no code: name and picture if known, and the sentence above.
- The card follows what plays: if the computer tunes the TV while the card is up, the card closes.

## The debug line

One line, monospace, `1.15rem` (18 px on the 720-line page). This is deliberately under the page's 24 px floor: it is for whoever leans in. It ends with an ellipsis rather than wrapping.

- **While tuning**: time since the tune (`00:01.42`), the latest player step Cast reported (`PLAYER_LOADING`, `LOADED_METADATA`, `BUFFERING`, ...), the engine (`shaka`), the kind (`hls` / `dash`), and the channel's place in the surf list (`ch 12/58`).
- **While playing**: the state (`PLAYING`), the picture size, the bitrate playing and the measured bandwidth, seconds buffered ahead, seconds behind the live edge (live only), dropped frames, and how long the start took.
- Numbers come from Cast's player statistics (`PlayerManager.getStats()`) and the video element. A field the device does not give is left out, not shown as zero or blank.
- Never an address, a host, or anything from the stream's URL.

## The QR code and its setting

- The code's grid comes from a small QR library (`qrcode-generator`, MIT, no dependencies); PRISM draws it as SVG itself, so the TV and `/admin` draw exactly the same picture from one module of style definitions.
- **Tests**: each style, for a few real ids, is drawn to pixels and read back with a decoder (`jsQR`, a dev dependency). The tests run in jsdom, which cannot turn SVG into pixels: the real SVG is rasterised with `@resvg/resvg-js` (a dev dependency with prebuilt binaries for Windows and Linux), so the test reads exactly what the TV shows, gradients included. A light-on-dark style is read after inverting the picture. In the comp B was read by the owner's Galaxy Z Fold5 camera but not by jsQR: B's colours may be adjusted (keeping its look: light rainbow dots on near-black) until the decoder reads it too.
- **The setting** lives on the history server (`prism-data.nooroticx.tv`), not on `prism.nooroticx.tv`: that site is static (GitHub Pages) and cannot answer a request. The owner's idea of the TV asking `prism.nooroticx.tv/admin?getQRStyle` becomes:
  - `GET /api/tv` (public, like `/api/streams`; `Cache-Control: public, max-age=300`) answers `{ "v": 1, "qrStyle": "a" | "b" | "c" }`;
  - `POST /api/admin/tv` (owner only, like the other admin writes) with `{ "qrStyle": ... }`; anything else is refused; every change written to the admin audit;
  - stored in the existing key-value table (`job_state`, key `tv_qr_style`); no migration. Unset means B.
- *(Builder's call, recorded:)* the TV asks at start and each time the share card opens, with `cache: 'no-cache'` so it never trusts a stale copy; the card draws at once with the last style it knew and redraws if the answer differs. It keeps the last good answer; unreachable or nonsense means B. So a change in `/admin` shows the next time a card opens.
- **`/admin`**: a "TV" screen (a new tab beside Health) showing the three styles drawn with a real channel's link, which one the TV uses, and a way to choose. It says the TV uses the new style the next time its code is shown. It reads the current style with `cache: 'no-cache'` and takes the POST's answer as the new state, so the browser's cache never shows the old one.

## The help page

- **Two addresses** (owner, 2026-11-25: "it makes it easier if I'm attempting to load PRISM via browser directly on a chromecast via remote"): the TV page moves to `https://prism-cast.nooroticx.tv/tv/` and the help page is `/`. Nothing has to guess which one a visitor wanted, and a browser on a TV (the Gen 5's browser already runs PRISM's site) can be sent to either.
- **The owner changes the receiver address in the Cast console** to `https://prism-cast.nooroticx.tv/tv/` before the app is published. Until a device picks that up, `/` forwards a Cast device (user agent contains `CrKey`) to `/tv/` at once, from a small classic script in `<head>`, before anything else loads; Google's receiver script is only ever loaded by `/tv/`.
- The cast build becomes two pages (`cast/index.html` for the help page, `cast/tv/index.html` for the TV page); the upload tool sends `index.html` files last, the TV page's before the help page's.
- `/tv/` opened in a browser that is not a Cast device (a computer, or a TV's own browser): a short notice on the TV page's look, "This is PRISM's TV page. It runs when you cast PRISM to a TV", with a button to `/`. Google's receiver script is not loaded there. `?tv` still forces the real TV page in any browser, for testing against Google's framework on a computer, and `?dev` keeps the dev server's stand-in.
- Same fonts and colours as the TV page, the ring round its panel, PRISM's mark. Buttons go to `https://prism.nooroticx.tv/twitch`, `/youtube`, `/hls-dash` in the same tab.
- Works at phone width too (someone can type the address on a phone).
- `noindex` stays.

## Testing

- Unit: the remote reducer (the new keys and the card's timeout), the debug line's text from sample statistics (including missing fields and that no address can appear), the clock's text for a fixed time and time zone, the QR read-back per style, the forward from `/` on a Cast device, the join rule in the sender (already-playing TV: no load; idle TV: the page's stream), `GET /api/tv` and `POST /api/admin/tv` on the server (PHP tests, as the other endpoints), and the admin screen.
- On the dev stand-in (`/cast/tv/index.html?dev`) at 1280 x 720, against the comps.
- On the device, added to the owner's checklist: the share card and scanning its code with the Fold5 and, if one is at hand, an iPhone (style B especially); the clock's time zone; whether the ring and the rainbow text are smooth on the Gen 5 and the Ultra; an Android phone joining while the TV plays (no retune); the help page in a desktop browser and casting it from Chrome's menu; the app starting at `/tv/` after the console change, and at `/` (forwarded) before it; switching the QR style in `/admin` and seeing it on the TV.

## Rollout

Three pieces, each on the owner's go, plus the owner's change of the receiver address in the Cast console: the history server's new endpoint (upload with `server/tools/deploy.mjs`, nothing to install), the TV page (`tools/deploy-cast.mjs --go`), and the site's `/admin` screen and join rule (the Pages deploy, by merging). The TV copes with the server not having the endpoint yet (it uses B). Merging waits for #137.

## Left to the builder

Exact sizes and spacing beyond the comps; the order of fields in the debug line; the admin screen's layout beyond "three drawn styles, the current one, a choice"; how the rainbow text is animated, within the anti-goal.
