# Channel page, offline layout — design

Date: 2026-11-11. Status: APPROVED by the owner on 2026-11-11 (visited channels get TwitchTracker numbers from the server, never from the browser, for now). Author: Claude, from a conversation with the owner
(the layout was chosen in the visual companion; the owner's own words are quoted where they are the source).

## Intent and why

`/twitch/<channel>` today always leads with a video player, even when the channel is offline and the player shows
nothing but an "offline" notice. The owner wants the page to use that space well when nobody is streaming: fold the
video away, give the chat the room, and put the channel's stats where the video was competing with them. Twitch itself
separates a channel into Home / About / Videos tabs; PRISM has none, and the owner's answer is that stats living on the
channel page itself "saves us from needing internal tabs/dividers".

This is the first of two pieces that came out of "the history database" idea:

1. **This project: the offline layout and the stats slot.** Client only, no server.
2. **A later project: the history server** (IONOS MySQL + PHP) that collects numbers for channels people visit. It
   fills the stats slot for channels other than the viewer's own. It gets its own design.

## What the owner decided (their words and choices)

- When the channel is offline, "we can minimize/hide the video panel, expand chat".
- Stats go "after the profile div and before the 'clips' / 'hours streamed' blocks begin" (the profile block, then the
  new stats, then the existing four cards, then the clips and VODs grids).
- Layout: chat as a tall side column ("C") in a wide window, chat across the top ("A") in a thin window, because "mobile
  can't do C". Twitch's own chat has a header that eats height, which is why the chat-height drag bar exists.
- Chosen by clicking A then C in the mockups, then confirming the combination ("perfectly in-line with my thoughts").
- The streamer's bio already sits in the profile block (`ProfileSidebar`, two lines with the full text on hover). It
  stays as it is.

## Goals, non-goals, anti-goals

Goals
- An offline channel page that spends no space on an empty player and gives chat a tall, stable column (wide window)
  or a full-width, drag-resizable block (thin window).
- A place for the stats between the profile and the existing cards, filled where this project can fill it honestly.
- A live channel's page is what it is today, apart from the stats slot.

Non-goals
- Any server, database or stored history; the history charts for other people's channels (next project).
- Changing what the profile block, the four existing cards and the clips and VODs grids show or do. Class-only
  responsive changes so they fit the narrower left column in layout C are allowed (see "Wide window").
- A signed-out redesign: signed-out viewers keep today's page (see "When the page counts as offline").

Anti-goals (would make this a failure even if it works)
- The chat reloads when the layout changes (it is an iframe; it has been kept alive across layout changes on purpose,
  see `ChatDock`).
- The page jumps or flickers between the two layouts while the viewer drags a window edge.
- A channel that goes live while the page is open is left showing "offline" with the player folded.
- The browser starts asking a third party about channels a viewer merely visits (see "Open question for the owner").

## The page today (facts from the code)

- `src/pages/TwitchPlayerPage.tsx`: `ChatDock` (player + chat row), then `ProfileSidebar`, `StatsRow` (Clips, Hours
  Streamed, Content, Engagement; signed out it shows a connect prompt), `DebugPanel`, then `ClipGrid` and `VODGrid`.
- `src/components/chat/ChatDock.tsx`: player and chat side by side from the `md` breakpoint, stacked below it; chat can
  be docked left or right, hidden, or popped out; a handle between them sets the player/chat ratio (`LOCAL_PANEL_RATIO`).
  When the video floats in its own window the player box stays as an invisible spacer, the chat fills the row, and a
  drag bar under the chat sets a taller minimum height (remembered). That floating state is the closest thing to
  layout "A" that already exists.
- Whether a channel is live: `state.channel.isLive` in `AppContext` (from the Helix streams call; the channel data is
  only fetched when the viewer is signed in, `TwitchPlayerPage` passes `null` otherwise). `PlayerHost` also keeps a
  private `isOffline` flag from the embed's offline/online events, shown inside the player. It is not in shared state.
- `getBroadcasterFollowerCount` and `getFollowerDates` work only for the signed-in viewer's own channel (the scope rule),
  so another channel's follower total and history are not available from Twitch.
- The streamer row and the three 30-day panels (`StreamerRow`, `ThirtyDayPanels`, hooks `useStreamerNumbers`,
  `useStreamerHistory`, `useTrackerSummary`) are wired inside `TwitchDashboard` and gated on the viewer being an
  affiliate or partner.

## The design

### When the page counts as offline
- Signed in and `isLive` is false once the channel data for THIS channel has loaded: offline layout. "Loaded" means
  `state.channel.profile.login` equals the route's channel; `LOAD_CHANNEL_START` does not clear the previous channel's
  data, so `state.loading` alone is not enough. Until then, and after a load error: today's layout.
- Signed out: today's page, unchanged. (Reason: without a Twitch token the page has no reliable live/offline answer
  other than the embed's own events, and the embed has to stay visible to report them. My call, see below.)
- A live channel: today's page.

### Wide window (`lg`, 1024px, and up): layout C
- The switch point is a tuning value, starting at `lg` rather than `md` because at 1100px wide the left column is only
  about 600px once the chat column, the rail gutter and the page padding are taken off. Judge it by eye at 1100, 900 and
  768px in the built-in pane. Below it, layout A.
- Two columns. Left: the folded-player strip, the profile, the stats slot, the four existing cards, the clips and VODs.
  Right: the chat, a tall column that stays in view (sticky) while the left column scrolls. The chat is always on the right
  in this layout, whatever dock side is remembered, as on Twitch.
- A vertical handle between the columns sets the chat's width, reusing `ResizableHandle`; the width is remembered under
  its own storage key (the player/chat ratio does not apply, there is no player in the row).
- The cards, grids and 30-day panels pick their column counts from the viewport (`lg:grid-cols-4`, `md:grid-cols-2`,
  `md:grid-cols-3`, `lg:flex-row`). In C they would squeeze as if the window were full width. Make them follow their own
  column instead (Tailwind v4 container queries, class changes only, no change of content or behaviour).
- Chat controls while the player is folded, following the floating-video precedent (`dockControls={!floating}`): the
  swap-side button and the drag grip are hidden (nothing to dock beside); Fill and Fullscreen are hidden (they mean
  "fill video and chat"); text size, hide and pop out stay. Hide or pop out collapses the chat column and the left column
  takes the full width, with the existing slim restore strip where the chat was. When the viewer unfolds the player, the
  controls come back as they are today.

### Thin window (below the switch point): layout A
- The folded-player strip, then the chat across the full width at a default height, a horizontal drag bar along its bottom
  edge that makes it taller, then the profile and everything below as today.
- The existing floating-video drag bar is NOT reusable as it is: its handle is `hidden md:flex`, the minimum height is
  applied from `md` up and only while a video floats. Layout A needs it at every width, so those conditions change. The
  bar is an 8px target, too thin for a finger on a phone: give A a larger hit area. The height is remembered in the same
  place as the floating-video height (one number for both). A value dragged on a phone is clamped on the desktop by the
  existing `min(..., 100vh - header)`.

### The folded-player strip (both layouts)
- One line: a live-status dot, "Offline", how long ago the channel last streamed when that is known, and a "Show player"
  button. "Last streamed" uses only the loaded recordings of type `archive` (the loaded list also holds highlights and
  uploads), the newest one's `created_at` plus its parsed duration. `formatUptime` is an elapsed `H:MM:SS`, not an "X ago"
  formatter, so a small new formatter is needed. Omitted when there is no archive.
- "Show player" unfolds the video back into the page (in C above the profile in the left column, in A under the strip).
  The choice lasts for the visit and resets when the route's channel changes (the page component stays mounted across
  `/twitch/:channel` changes, so plain state would carry over to the next channel).
- Choosing a clip or a VOD while the player is folded unfolds the player automatically and scrolls to its place, since on
  an offline channel the clips and VODs are the main content. The fold state therefore also watches `player.detection`:
  anything other than the channel's own live URL being set unfolds it.
- The floating-video control (`canOpen` is true for any Twitch stream URL, offline or not) is hidden while the player is
  folded, because there is no video to pop out.

### The stats slot
- A named component between `ProfileSidebar` and `StatsRow`, in every layout, live or offline. The owner's words were
  "if we have stats, ... we show stats after the profile div", so the slot is not tied to the offline layout: it shows
  whenever there are stats to show. A live channel's page is otherwise exactly as today; the slot is its one addition.
- This project fills it for one case: the viewer is looking at their own channel and is an affiliate or partner. Then it
  shows the same streamer row and 30-day panels as the dashboard. To share them, the "streamer block" inside
  `TwitchDashboard` (the hooks plus the two components) becomes its own component that both pages use. It needs a `now`
  (the dashboard uses `useNow`) and an expired-token path: the dashboard passes `onSessionExpired` from
  `useSessionExpiry`, the channel page today uses `handleAuthError` from `useTwitchAuth`. Use the dashboard's path so an
  expired token signs the viewer out the same way on both pages.
- For every other channel the slot renders nothing in this project. No empty promise, no placeholder. The history project
  fills it. The slot and the data shape the dashboard hooks use (day series of `DayBucket { day, at, value: number | null }`,
  per-broadcast `{ at, value }`, plus `coverageDays` and a `source` label) are what the next project plugs into.
- Overlap with the existing four cards (both show hours streamed) is accepted: the existing card is derived from the
  loaded recordings, the new chip is TwitchTracker's 30-day figure and is tagged TT. Merging them is a later decision.

### Going live while the page is open
- While the offline layout is shown and the viewer is signed in, the page re-checks the channel's live status about once a
  minute, only while the tab is visible. The result goes into the shared channel state (a small new reducer action that
  updates only `isLive` and `stream`), not a page-local flag, because `ProfileSidebar` draws its LIVE badge, viewer count,
  uptime and "Return to LIVE" from that state, and `LOAD_CHANNEL_SUCCESS` would refetch everything and reset
  `displayMode`. When the channel goes live the layout returns to today's: the player unfolds and loads as it would on
  opening a live channel, chat goes back to its docked place, and the page scrolls to the top so the new player is in view
  (an embed only autoplays while visible).
- If the player was unfolded by the viewer (they pressed "Show player" or chose a clip or recording), the page KEEPS the
  offline layout when the channel goes live: swapping to the live layout would remount the player, and a recording being
  watched would start over at 0:00 (found by the final review). The strip then says "Live now", and when the player is on a
  clip or recording it offers "Watch live", which points the player at the live stream. The poll stops. The viewer gets the
  normal live layout on their next visit or channel change.

### What may reload the chat
Today the chat lives inside `ChatDock`'s row, and the profile, cards and grids are siblings after that row. Layout C
needs the chat in a column beside the whole page body, and a DOM node (and an iframe) cannot move between parents without
reloading. So:
- Between layouts C and A: never. One element, placed by CSS classes only.
- When an offline channel finishes loading (today's layout, then the offline layout): the chat reloads once, about a
  second after the page opens. The Twitch embed also mounts and is torn down once on every offline open (the code warns
  that embed churn gets rate limited by Twitch, so this is noted, not ignored).
- When a channel goes live while the page is open: the chat reloads once.
- Avoiding those two reloads means restructuring the page so the chat sits at a fixed place in one tree for every state,
  touching fill mode, the floating-video spacer, the `fill-hide` wrappers and their tests; or not drawing the player and
  chat until the live answer is known, which delays every live channel's player. This design accepts the two reloads
  (see "Open question for the owner").

## Data and code touchpoints (suggested, the builder may change them)
- `TwitchPlayerPage` decides the layout; `ChatDock` gains an offline mode (or a sibling component does, if that keeps
  `ChatDock` readable: it is already 340 lines). Keep the chat element in one place in the tree so it is never remounted.
- New: `OfflineStrip`, a `useChannelLive` hook (the poll), a width-storage key in `src/config/storageKeys.ts`.
- Move the streamer block out of `TwitchDashboard` into a shared component; keep its behaviour and tests.
- Reuse: `ResizableHandle`, `chatLayout.ts` (heights), `useChatPlacement`, `formatUptime`-style formatting for "last live".

## Testing
Vitest and Testing Library as in the rest of the project; run the suite with `--maxWorkers=2`. At least: live channel
renders today's layout; offline signed-in renders strip + chat and no player; signed out renders today's layout; the
layout switches at the `md` width (matchMedia is non-configurable in `src/test/setup.ts`, test through the component's
own seam); the chat element is the same DOM node across a layout change (not remounted); "Show player" unfolds and the
choice does not persist; the poll starts only in the offline layout and stops on unmount and while the tab is hidden; a
channel that goes live restores today's layout; the stats slot shows for the viewer's own affiliate/partner channel and
renders nothing for any other channel; the shared streamer block still passes the dashboard's existing tests; the width
and height are remembered and clamped; choosing a clip or VOD while folded unfolds the player; "Show player" resets when
the route's channel changes; the chat controls shown while folded are the listed ones; the poll writes `isLive` and
`stream` to shared state and does not trigger a full reload; "last streamed" ignores highlights and uploads.
`TwitchPlayerPage.fill.test` mocks `useApp` with only `state.player`; the page will now also read `state.channel`,
`state.auth` and `state.loading`, so that mock needs extending (the scroll test uses the real provider).

## Done means
1. Signed in, offline channel, window 1100px wide: strip, profile, then the page below on the left, chat as a tall
   pinned column on the right, widenable; the chat does not reload when the window is resized across the breakpoint.
2. Same channel at 375px: strip, full-width chat with a working height bar, then the profile and the rest.
3. A live channel and a signed-out viewer see today's page, apart from the stats slot below.
4. The owner's own channel, live or offline, shows the streamer row and 30-day panels between the profile and the four
   cards; another channel shows nothing new there.
5. A channel that goes live during the visit returns the page to the normal layout.
6. No new dependency; type check, lint, tests and the production build are clean.

## Unverified (check, do not assume)
- Whether the Twitch chat iframe survives being moved between the two layouts without reloading (the dock keeps it alive
  today across other changes; a move between a row and a sticky column may differ).
- How `position: sticky` behaves inside the page's existing scroll container and header.
- Whether a once-a-minute `getStreams` call is cheap enough for the rate limit when several tabs are open.
- What the embed does when it is mounted but folded (relevant only if signed-out support is added later).

## Open questions for the owner
- **DECIDED by the owner (2026-11-11, "Accept the reloads"):** the chat may reload once when an offline channel finishes
  loading and once when a channel goes live during the visit (about a second each). Moving between the wide and thin
  layouts never reloads it. No restructure of the page (see "What may reload the chat").
- **DECIDED by the owner (2026-11-11):** visited channels DO get TwitchTracker numbers, fetched by the history SERVER, not
  by the viewer's browser ("we keep TT at server first for sure"). The browser asks TwitchTracker only about the viewer's
  own channel (the dashboard and this page's stats slot, already accepted). Whether the browser should also call
  TwitchTracker for updates on visited channels is revisited once the server runs ("we'll see how it goes with server,
  maybe adjust in the future"). Reason for server-first: a browser call would tell twitchtracker.com which channels PRISM
  viewers watch, with their IP. This project is client-only, so until the server project lands the slot is empty for other
  channels; the server project is next on the list.

## My calls (marked so they can be overruled)
- Offline layout for signed-in viewers only; signed out keeps today's page. Cost if wrong: signed-out viewers of an
  offline channel still see an empty player and no tall chat.
- The stats slot is empty for other people's channels until the server project. Cost if wrong: most channels show no new
  numbers after this ships; the layout change is the visible part.
- The wide/thin switch starts at `lg` (1024px) and is tuned by eye. Cost if wrong: one number to change.
- The cards, grids and 30-day panels get class-only container-query changes so C does not squeeze them. Cost if wrong:
  those components' classes and tests change for no visible gain.
- Chat in C is always on the right; swap-side, grip, Fill and Fullscreen are hidden while the player is folded. Cost if
  wrong: a remembered left dock is ignored on offline channels.
- Choosing a clip or VOD while folded unfolds the player. Cost if wrong: one more click would have been expected.
- The stats slot shows live or offline (from "if we have stats"). Cost if wrong: a live own-channel page has one extra block.
- One-minute live poll, visible tab only, writing to shared state.
- "Show player" is remembered for the visit only and resets on a channel change.
- Shared streamer block extracted from `TwitchDashboard`, using the dashboard's expired-token path.
- A larger drag-bar hit area in A, and one remembered height shared with the floating-video chat.

## Not in this project
The history server, any stored history, other channels' charts, signed-out offline detection, merging the new chips with
the existing four cards, the bio-links (YouTube / Kick) reading, user-submitted links.
