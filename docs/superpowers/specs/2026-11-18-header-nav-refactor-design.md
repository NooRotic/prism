# Header nav refactor: section tabs, a folding row, and Accounts — design

Status: DRAFT for the owner's approval (2026-11-18). Branch `feat/header-nav`, cut from `main` at 61e9861 (PR #97,
YouTube Catch up, is merged there).

## Intent and why

The owner, in their words: the header is "locked to Twitch, the following, stats, browse are all twitch, if I want to
get to hls-dash or youtube, I have to back out to root page then back into those pages, header i want to easily be able
to go between". And: "'Log out' is currently all tied to twitch and we're adding youTube login now, so we need to show
login statuses over platforms".

Today (`src/components/layout/Header.tsx`): the PRISM mark (home link); Following / Your Stats / Browse (`HeaderNav`,
all Twitch, shown only when signed in to Twitch); the paste box on player pages; the debug gear; one Twitch button
("connect twitch" or "logout"). No link to any section. The signed-in name and avatar are loaded
(`state.auth.user`) but never shown.

A side reason: the owner tested whether videos watched in PRISM reach their YouTube History and was unsure the
browser was signed in to YouTube. History follows the browser's own youtube.com sign-in, which PRISM cannot read (the
#97 lab confirmed history does update when that browser is signed in). The header should make that one click to check.

## Goals

1. Links to **Twitch, YouTube and HLS/DASH on every page** that has the header, with the current section marked.
2. Each section's tools in a **second row that folds away** and opens on demand: Twitch has Following, Your Stats and
   Browse; YouTube has Catch up; HLS/DASH has none.
3. One **Accounts** control showing sign-in status per platform: Twitch (sign in / sign out) and YouTube (subscription
   import status, Import / Re-import, a link to check the browser's youtube.com sign-in). It replaces the Twitch-only
   "connect twitch" / "logout" button.
4. The **paste box behind a link icon** where the header shows it today, opening into the bar when clicked.
5. On a phone (below 640 px) the folded header is **one row** (today it is two).

## Non-goals

- The Following / Your Stats panels and the Browse dropdown keep working as they do now (they open over the page and
  still pause a covered Twitch player; that is wish-list item 4, separate work).
- No lasting Google sign-in. The owner decided (2026-11-18) to keep YouTube **import only**: "there's no real payoff
  dealing with the refresh lifecycle, so lets keep it import only".
- `/admin` and the chat pop-out have no header and stay that way.
- The paste box's own behaviour (`SmartUrlInput`, what its suggestions offer, where it sends you) does not change. Only
  where the header's copy draws its list changes (below).
- The section links in the `/twitch` and `/youtube` listing pages' sidebars stay for now (see follow-ups).

## Anti-goals (would be a failure even if it works)

- Anything the header shows **covering a playing Twitch player**. Twitch pauses an embed that anything covers and does
  not resume it by itself (confirmed 2026-11-06, see `RailGutter.tsx`).
- The video **jumping whenever the mouse crosses the header** on its way to the paste icon, gear or Accounts.
- A YouTube status that claims "signed in". PRISM keeps no Google sign-in.
- **Signing the viewer out of YouTube**, or offering to. The owner: "don't intentionally log them out of youTube".
- The header **loading Catch up's lists or spending YouTube API quota** just by being on screen.
- Breaking `--header-height`, which the panels, the rail, the pages and the chat / fill layouts read.

## Constraints

- **Covered Twitch embeds pause.** The debug gear already lives in the header for this reason. Everything new in the
  header pushes the page down instead of drawing over it.
- **`--header-height`.** `useHeaderHeight` (ResizeObserver plus window resize) publishes the header's real height.
  `SlidedownPanel` sits `fixed` at `top: var(--header-height)`. When the row opens, the header gets taller and everything
  under it follows. Keep the hook as it is and let it see the taller header.
- **`fill-hide`.** The header carries it so fill mode (and the landscape-phone chat layout that forces fill mode) hides
  it. Keep it.
- **`[data-nav-trigger]`.** `SlidedownPanel`'s click-outside check calls `document.querySelector('[data-nav-trigger]')`
  (a single element) so that clicks on the Following / Your Stats buttons do not count as "outside". The element that
  holds those buttons must carry it, and only one element may.
- **`useCatchup()` loads all three Catch up lanes when it mounts** (subscriptions, Watch Later and the hidden Mix player).
  The header must not use it.
- **Google import needs a click.** `requestYoutubeReadToken()` opens Google's sign-in popup, so it must run from a user
  click. `isGoogleAuthConfigured()` is false in builds without `VITE_YOUTUBE_CLIENT_ID`.
- **Twitch Browse needs a Twitch sign-in** (`searchChannels` goes through the signed-in Helix fetch).
- Existing header tests fix some behaviour that should survive: 56 px tall on a wide screen; the paste box's routes
  (shown on `/hls-dash...`, `/twitch/:channel`, `/youtube/:id`; not on `/`, `/twitch`, `/youtube`); `fill-hide`; the
  debug toggle.

## Approaches considered

| | Approach | Verdict |
|---|---|---|
| A | The current section's tools sit next to the tabs in one row (on a phone they fold into the tab) | One click to Following on desktop, but the header changes from section to section |
| B | Each tab opens a menu holding its tools | The same header everywhere, but Following and Your Stats are always two clicks away |
| **C** | **Sections on top, the section's tools in a second row underneath** | **Picked by the owner: "the most clear"**. Its cost (more height) is answered by folding the row away |

On top of C, the owner asked for the second row to "collapse and expand down when rollover", and for the paste box not
to be always visible. The Accounts list opening in the same row (not as a drop-down) is my call, made for the
covered-Twitch-player reason above. The owner tried this in a clickable mockup and said "it feels good".

## Design (as decided)

### The top bar (always there)

From left to right:
- **PRISM mark and wordmark**, linking home. Below 640 px only the mark shows.
- **Section tabs: Twitch, YouTube, HLS/DASH.** Each is a link to `/twitch`, `/youtube` or `/hls-dash`, coloured from
  `PROTOCOL_META`. A tab is marked current when the page is in its section (`/twitch` and `/twitch/:x`; `/youtube` and
  `/youtube/:x`, including `/youtube/catchup`; `/hls-dash` and `/hls-dash/:x`). The hub and the not-found page have no
  current tab. Below 640 px the HLS/DASH tab reads "HLS".
- A tab that has tools (Twitch, YouTube) has a **▾ button** beside its label: the label goes to the section and the ▾
  opens that section's row. HLS/DASH has no ▾.
- A thin line along the bottom of the bar in the current section's colour shows that there is more underneath. It is
  neutral on the hub.
- Spacer, then the **🔗 paste icon** (only on the routes that show the paste box today), the **⚙ debug toggle** (640 px
  and up; below that it moves into the Accounts row), and the **Accounts pill**.
- Folded, the header is **56 px tall at every width**.

### The folding row

One row under the bar, shared by "a section's tools" and "Accounts". It shows one of them at a time.

**Opening it:**
- **Hover** (mouse only): resting on a tab that has tools for about 200 ms opens **that tab's** row, on any page.
  - The delay works like `ChannelRail`'s `OPEN_DELAY_MS`, so a pointer passing over the tabs does nothing.
  - "Mouse only" means checking `pointerType` on `pointerenter`, because touch laptops also report `(hover: hover)`.
  - For example, hovering Twitch on a YouTube page shows the Twitch tools.
  - Moving between the tab and the row keeps it open; leaving both folds it after about 350 ms.
  - **Only the tabs open it.** Crossing the rest of the bar (paste icon, gear, Accounts) does nothing.
- **Click or tap** on a ▾ opens that section's row. **Click or tap** on the Accounts pill opens the Accounts row.
  The keyboard uses the same buttons, which carry `aria-expanded` and `aria-controls`.

**One row, two ways of being open** (my call, settling the builder check):
- The row shows one thing at a time: one section's tools, or Accounts. It is open in one of two ways:
  - **previewed**, when hover opened it;
  - **pinned**, when a click, tap or key opened it.
- Clicking the ▾ of a row that hover already opened **pins it** instead of folding it. Clicking the button of a pinned
  row folds it.
- While the row is pinned, or held open (see below), hovering other tabs does nothing. Following and Your Stats
  therefore never leave the page while their panel is open.

**Closing it:**
- A previewed row folds when the pointer leaves the tab and the row.
- A pinned row folds when:
  - its button is pressed again,
  - Esc is pressed,
  - the viewer clicks outside the header (including into the video: clicks inside an iframe never reach `document`,
    so also watch `window` `blur` with `document.activeElement` being an `IFRAME`),
  - or the page changes.
- **Holds** stop only those automatic closes (the pointer leaving, a click outside). The row is held open while:
  - a Following or Your Stats panel is open,
  - the Browse dropdown is open,
  - keyboard focus is inside the row,
  - a YouTube import is running.
- **Explicit closes always work:**
  - Esc closes the innermost open thing first: an open slide-down panel or Browse. The next Esc folds the row and puts
    focus back on the button that opened it.
  - A page change folds the row. An import already running carries on, and its result shows the next time Accounts
    opens.
- **Fill mode:** the row folds when fill mode hides the header, so `--header-height` is not left at the tall value.

**What it does to the page:** it is part of the header, so the header grows and `--header-height` follows. The page
underneath is **pushed down, never covered**. This is the same on every page, which is my call: one rule instead of
the rail's "push on player pages, cover elsewhere". It opens with a short animation (about 150–200 ms) and none at all
under `prefers-reduced-motion`.

**Twitch row:**
- Signed in: **Following** and **Your Stats** (toggling the existing slide-down panels through `TOGGLE_NAV_PANEL`) and
  **Browse** (the existing `ChannelSearchDropdown`). The element holding them carries `data-nav-trigger`.
- Browse's dropdown is anchored `right-0` today, so in a left-aligned row it would run off the screen. Anchor it on
  the left.
- Its click-outside listener also counts the Browse button as outside, so a second click closes the dropdown and opens
  it again. Fix that while moving it.
- Signed out: one line, "Connect Twitch to see Following, Your Stats and Browse", and a **Connect** button (`login()`).
  This is my call, so the Twitch tab is never a dead end.

**YouTube row:** **Catch up** (a link to `/youtube/catchup`).

### Accounts

**The pill:**
- Twitch: the viewer's Twitch picture (`auth.user.profile_image_url`) when signed in, otherwise a grey Twitch dot.
- YouTube: the imported account's picture (`getAccount().thumbnailUrl`) when there is one. If the import found no
  picture, a red ▶. Never imported: grey.
- When neither is connected, the pill reads **"Sign in"**.
- Its accessible name spells out the state, for example "Accounts: Twitch signed in as NooRotic, YouTube subscriptions
  imported".

**The Accounts row:**
- **Twitch**
  - Signed in: picture, "Signed in as {display_name}", **Sign out** (`logout()`).
  - Signed out: "Not signed in", **Connect**.
  - Session expired (`auth.expired`): "Your Twitch session ended", **Connect**.
- **YouTube**
  - Imported: picture, "{n} subscriptions from {title}, imported {date}" (just "{n} subscriptions, imported {date}"
    when `title` is empty), **Re-import**.
  - Never imported: "Subscriptions not imported", **Import**.
  - While importing: the button reads "Importing…" and is disabled.
  - Build without Google sign-in (`isGoogleAuthConfigured()` false): no button, "Import isn't set up in this build".
  - A failed import shows a short reason, worded as on the Catch up page.
  - Always: **"History: check on youtube.com ↗"**, linking to `https://www.youtube.com/feed/history` in a new tab
    (`rel="noopener"`). It shows the viewer's YouTube history if this browser is signed in there, and Google's sign-in
    page if not. That answers the owner's test question directly.
  - **No sign-out.**
- **Below 640 px:** a **Debug overlay** on/off toggle (the same `TOGGLE_DEBUG`).
- No HLS/DASH entry: it has no account.

### Importing from the header

- **Split the import flow out of `useCatchup`** into a function both callers use (for example
  `importYoutubeSubscriptions()` in `src/lib/`). It runs: token, then `listSubscriptions`, then `getMyChannel` (whose
  failure must not lose the import), then `setSubscriptions` and `setAccount`.
- The **one-at-a-time guard moves with it** (module level), so the header and the Catch up page can never run two
  imports at once.
- `useCatchup().importSubscriptions` keeps its current behaviour: it calls the shared function, then refreshes its lanes.
  Its error wording moves with it, so both places say the same thing. #97's existing tests must stay green.
- After an import, a **change notice** reaches anyone showing the result. The Catch up page re-reads its account and
  count and refreshes its lanes; the header updates the pill and the row.
  - The Catch up page refreshes **once** per import, whichever side started it: through the notice, not through its
    own call as well. Two refreshes would spend the subscription quota twice.
  - Other tabs learn through `storage` events, listening to the account and subscription keys only, and debounced: one
    import writes three keys.
- **"Importing" is shared.** Both the header and the Catch up page show "Importing…" whichever one started it, so a
  click on one is never silently dropped while the other runs.
- **What counts as imported:** an account record, *or* a non-empty subscription list. Lists imported before 61e9861
  have no record; those show "{n} subscriptions imported" with no date.
- The header reads only `getAccount()` and `getSubscriptions().length`, cheap localStorage reads. It never calls
  `useCatchup()`.
- On a phone, Google's sign-in opens as a new tab, which hides PRISM. A Twitch stream can pause during an import
  started there. That's the browser, not the header covering it; it is expected.

### The paste box

- On the routes that show it today, a **🔗 button** ("Paste a link") stands in for it.
- Clicking it puts `SmartUrlInput` in the bar, focused.
  - 640 px and up: it grows into the room between the tabs and the icons (about 260 px, less if there is less room).
  - Below 640 px: it takes the whole bar for the moment, with a ✕ to close.
- It closes:
  - on Esc,
  - when focus leaves it while it is empty,
  - and after any submit. That includes a QuickLink or a multi-word search, which open the Category panel instead of
    a new page.
- It **opens empty** every time (my call). `SmartUrlInput` starts from the last search text today, which would also
  stop "closes when empty" from ever happening.
- Keep it **mounted and hidden** while closed, not mounted per click. Each mount replays the search history and flips
  its order (`SmartUrlInput.tsx:34-39`).
- From 640 to about 800 px, the wordmark hides while the box is open, so the box has room.
- The header's `backdrop-filter` makes it the containing block for anything `position: fixed` inside it. Keep that in
  mind for the phone overlay.
- **The suggestion list pushes the page down too** (owner's pick, 2026-11-18).
  - What's in the list: QuickLinks while the box is empty, then history and suggestions.
  - Opening the box from 🔗 focuses it, and focus opens the list. Today the list is `absolute top-full z-50` and would
    draw over the top of the video, which pauses Twitch.
  - In the header it is in the header's flow, under the bar: the header grows, `--header-height` follows, and the page
    moves down while the box is open, then comes back.
  - Cap its height to a few rows, scrolling inside, so the jump stays modest.
  - When the folding row is open as well, the list sits between the bar and the row, or the row folds while the box is
    open. That's the builder's call; either way nothing covers the page.
  - Elsewhere (the hub and listing pages' own paste boxes) the list keeps its current overlay; there's no player under
    it there.
- `SmartUrlInput`'s own logic is unchanged apart from that. It needs a way to be focused when shown, to say when it is
  done, and a way to lay out its list in the flow instead of as an overlay (for example a prop).

### Phone (below 640 px)

- Folded, it is one row: mark, tabs (HLS/DASH reads "HLS"), 🔗 where shown, and the Accounts pill.
- The gear is in the Accounts row.
  - Render only one gear at a time; a CSS-hidden second one would make the debug toggle ambiguous to tests and screen
    readers.
- The paste box, when open, covers the bar's own contents only, never the page.
- **Widths** (my call, settling the builder check):
  - It must fit on one row at **360 px**, the common Android width.
  - Below that, the pill's "Sign in" text gives way to a person icon first, then tab padding tightens.
  - At 320 px nothing may scroll sideways. That's the bug the old header had, and goal 5 exists because of it.

**Landscape phone:** the header is hidden by fill mode as today. Check that nothing changed.

## Check first

**Before building the rest,** check on a real live Twitch channel page that pushing the player down does not pause it.
Test it on a short laptop window, where the push moves part of the player below the fold. Run the push as the planned
animation, with `--header-height` changing on every frame.

If Twitch pauses, stop and bring it back to the owner. The design rests on that.

## Testing

- The `matchMedia` mock in `src/test/setup.ts` answers `false` to every query. Hover tests need to override it for
  `(hover: hover)`.

- **Component tests** (vitest + Testing Library), alongside the existing `Header*.test.tsx` (updated where they pin
  the old buttons):
  - **Tabs:** links, and which tab is current on each kind of route.
  - **▾ buttons:** they toggle the row and set `aria-expanded`.
  - **Hover:** open and close with the delay, using fake timers. Only the tabs open the row.
  - **Staying open:** while a panel is open, while Browse is open, and while focus is inside. Esc closes it, and so
    does a route change.
  - **Twitch row:** signed out and signed in.
  - **Accounts row, every state:** Twitch in / out / expired; YouTube never / imported / no title / importing /
    unconfigured / failed.
  - **YouTube never signs you out:** no sign-out control anywhere.
  - **History link:** its address and that it opens in a new tab.
  - **Paste icon:** it appears only on the same routes as today (port `Header.pasteBox.test.tsx`), and it opens,
    focuses and closes. The header's copy draws its suggestion list in the flow, not as an `absolute` overlay.
  - **Gear:** it sits in the Accounts row below 640 px (class-based, as the current layout tests are).
  - **`data-nav-trigger`:** exactly one element carries it.
  - **Height:** still 56 px folded on a wide screen.
- **Import split tests:**
  - the shared guard;
  - a failed channel lookup still imports;
  - the change notice fires;
  - `useCatchup`'s tests stay green.
- **By hand** at desktop, 640 px, 375 px, 360 px and a landscape phone, on a Twitch channel page:
  - hovering the tabs pushes the video down and does not pause it;
  - opening Accounts and the paste box (with its suggestion list showing) does not pause it;
  - Following and Your Stats still open and close;
  - Re-import works from the header and the Catch up page picks it up.
- `tsc`, lint, build.

## Left to the builder

- Sizes, spacing, icons (lucide), exact timings within the ranges above, and colours from the existing tokens.
- How the import change notice works (a window event or a small subscribe in `catchupStore`).
- How `SmartUrlInput` is told to focus and reports "done" (props are fine).
- How the header is split into components (tabs, row, Accounts row, paste toggle).
- Exact wording, kept plain like the rest of PRISM.

## Follow-ups (not this change)

- The `/twitch` and `/youtube` listing pages' sidebar section links become redundant; drop them later if the owner
  agrees.
- Following and Your Stats still cover and pause a Twitch player (wish-list item 4: pop-out plus playhead).
