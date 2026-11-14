# Playlist screen: play a stream in place (design)

Date: 2026-11-14. Approved by the owner in chat the same day. A small change on top of piece 2, Stage C
(`docs/superpowers/specs/2026-11-13-playlist-admin-design.md`, "Piece 2 as built").

## Intent

Trying `/admin/playlist` live, the owner asked for a way to view a stream from the screen, ideally without leaving it, so
a stream can be validated where it is managed. The streams worth retesting most are the ones visitors do not see
(dead, held, unplayable), and the visitor page cannot open those by id.

## Goals

- Play any stream that is not removed, from its row, on the Playlist screen.
- A link that opens the same stream on its own page.
- A failure shows the player's own error card (retry, "try as"), so the screen answers "would a visitor see this play".

## Non-goals

- No automatic check and no "mark dead" or state change from the preview (the checker is piece 3).
- No change to the server, to what the list returns, or to the visitor page.

## Approaches

1. **A row that opens under the one clicked (chosen).** Same pattern as the inline edit row: no scrolling away from row 40,
   one preview at a time, and no new layout.
2. A fixed player above the table. Simple, but playing a row far down means scrolling up and losing your place.
3. A link only (a new tab). Cheapest, but it is not "the same page", and the visitor page cannot open unlisted streams by id.

## Design

- Every row whose state is not `removed` gets a **Play** button. It opens a row directly under it holding the player
  (at most 640 px wide), a **Close** button, and a line "Playing as HLS · host" (the kind and the host, never the full
  address). One preview is open at a time: opening another, editing or removing that row, paging, or changing a filter
  closes it.
- **Open in a new tab** next to Close: `/hls-dash/<publicId>` for a stream visitors can see (`new`, `working`, `suspect`,
  so the owner tests what visitors get), and `buildStreamPath(url, kind)` (the pasted-address form of the same page) for
  the others.
- The player is `StreamPlayerPanel` with its heading off, with the stored kind. It gains one optional prop,
  `onTryAs(kind)`, which replaces its default of navigating to the pasted-address page. In the preview it changes the
  previewed kind only and saves nothing. The panel is keyed on address and kind so a change remounts it.
- A stream that cannot be played here at all (an address that is not `http(s)`, which the store should not hold, or a
  Twitch or YouTube address) shows a short "cannot be played here" line instead of the player.

## Constraints and things to know

- `http://` streams cannot play on an `https` page (mixed content): the error card shows that, which is the correct answer
  for "will visitors see this".
- The admin screen already sits inside the app providers (`AppProvider`), which `PlayerHost` needs.
- `PlayerHost.tsx`, `VideoJSPlayer.tsx`, `types/player.ts` and `SmartUrlInput.tsx` are not touched.

## Calls made without the owner (for them to check)

- Inline under the row, not a side panel.
- One link, not two ("visitor page" for listed streams, pasted-address form for the rest).
- The stored kind is the starting point; "try as" is preview-only.

## Left to the builder

Exact wording and classes; how the "cannot be played here" case is detected (reuse `resolveStreamSource` rules if it
fits, else a small check next to the preview).
