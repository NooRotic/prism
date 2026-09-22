# Channel Rail — Design

**Date:** 2026-09-21
**Status:** Approved, not implemented
**Scope:** Global (`AppLayout`). Follows section everywhere; recommendations
section only on `/twitch/:channel`, where a category exists.

**Revised 2026-09-21** after review. Three decisions changed and one defect
was corrected; see *Revision log* at the end.

---

## Problem

PRISM has no equivalent of Twitch's channel rail. Once you're watching a
channel there is no way to see who else you follow is live, and no way to
discover adjacent streamers, without leaving for twitch.tv.

PRISM *does* have a Following slide-down panel, but it is a browse surface:
you open it, scan, sort, and close. It answers "show me my follows." It does
not answer the glance-sized question — "who can I switch to right now" —
which is what the rail is for.

## Goals

1. Show followed channels that are live, at a glance, while watching.
2. Surface adjacent streamers in the same category, weighted to promote
   people beyond the top of the leaderboard.
3. **Preserve video space.** This is the governing constraint. Any design
   that costs meaningful player width loses.

   Revised: the rail **never resizes** the player. It floats above it. The
   collapsed strip does occlude a narrow edge of the video — that is the
   accepted cost of not reflowing, and it is why the collapsed width is kept
   minimal (see *Overlay*).
4. Accommodate one rail per platform in future (YouTube, Kick) without
   restructuring.

## Non-goals

- Replacing the Following slide-down panel. It stays; see *Relationship to
  the Following panel*.
- Building the YouTube or Kick rails. See *Why only Twitch today*.
- A `top` rail position. Designed for, deliberately not built.

---

## Why only Twitch today

A YouTube rail is **not buildable** right now. `src/lib/youtubeApi.ts` is
API-key based (`VITE_YOUTUBE_API_KEY`, line 1) with no user OAuth, so PRISM
has no way to know who the signed-in user subscribes to. A YouTube follows
rail needs a full Google OAuth flow — consent screen, scopes, token storage,
refresh — none of which exists. Kick is further out still.

This is why the design is *structured* for N platforms but *builds* one. The
alternative — a provider registry — would mean deriving a plugin interface
from a single implementation, for platforms blocked behind unbuilt auth. The
one thing guaranteed wrong about an abstraction drawn from one example is the
abstraction.

What we commit to instead is the **data contract** (`RailEntry`), which can
be validated against real Twitch data today.

---

## Architecture

### Component tree

```
AppLayout
└── ChannelRail                     position, overlay, section order
    ├── RailSection  (Twitch)       label + icon + entries
    │   └── RailEntryCard × n       avatar; expands on hover/focus
    └── RailSection  (Category)     only when a category is in context
        └── RailEntryCard × n
```

The rail mounts in `AppLayout`, not `TwitchPlayerPage`, so the follows
section is available on every route. The category section is conditional: it
renders only when `state.channel.stream` supplies a `game_id`, which happens
only on `/twitch/:channel`. On the hub, protocol pages, YouTube and HLS/DASH
routes the rail is follows-only.

`RailSection` is platform-agnostic: it takes a label, an icon, and entries,
and knows nothing about where they came from. This is what makes a future
YouTube section additive — append a section, touch no existing code.

The primitive is justified by today's code, not by the future one: there are
already **two** sections (follows and recommendations), so it is factored
from two real cases.

### Files

**New**

| File | Purpose |
|---|---|
| `src/components/rail/ChannelRail.tsx` | Strip shell: position, overlay placement, section ordering, empty-collapse |
| `src/components/rail/RailSection.tsx` | One labelled group of avatars |
| `src/components/rail/RailEntryCard.tsx` | One avatar; collapsed circle + expanded overlay panel |
| `src/components/rail/types.ts` | `RailEntry`, `RailPosition` |
| `src/components/rail/useRailPosition.ts` | Reads/writes `STORAGE_KEYS.LOCAL_RAIL_POSITION` |
| `src/hooks/useCategoryRail.ts` | Top-3 + random-sample recommendations |
| `src/hooks/useRailAvatars.ts` | Batched avatar lookup + `Map<userId, avatarUrl>` |
| `src/components/ui/ConnectTwitchPrompt.tsx` | Extracted shared connect prompt (see *Debt repaid*) |

**Modified**

| File | Change |
|---|---|
| `src/components/layout/AppLayout.tsx` | Mount rail as a fixed overlay sibling |
| `src/lib/twitchApi.ts` | Add `getUsersByIds()` — batched `/users?id=`, chunked at 100 |
| `src/config/storageKeys.ts` | Add `LOCAL_RAIL_POSITION` |
| `src/contexts/AppContext.tsx` | Add `rail: { position, expanded }` |
| `FavoritesCard`, `ProtocolPage`, `StatsRow`, `ProfileSidebar` | Replace hand-rolled connect prompts with the extracted component |

### Data contract

```ts
export interface RailEntry {
  id: string                 // platform-scoped: "twitch:71092938"
  displayName: string
  avatarUrl: string
  href: string               // in-app route: /twitch/xqc
  isLive: boolean
  viewerCount: number | null
  streamTitle: string | null
  gameName: string | null
  startedAt: string | null   // ISO 8601; drives uptime
}

export type RailPosition = 'left' | 'right' | 'top'
```

IDs are platform-scoped so they cannot collide when a second platform is
added.

`'top'` is in the union deliberately. Only `left` and `right` are
implemented; `top` is an explicit, documented gap rather than a silent
fallthrough, so the seam is visible to the next person who opens the file.

### Data flow

**Twitch section.** `useFollowedChannels` supplies most of `RailEntry` —
`EnrichedFollow` carries `isLive`, `viewerCount`, `gameName`, `streamTitle`,
`thumbnailUrl`, `startedAt`. Apart from the avatar, the Twitch section is a
mapping function over an existing hook.

**Avatars require one new call.** *(Corrected 2026-09-21 — the original spec
claimed "no new Twitch API calls, no new quota." That was wrong.)*

`EnrichedFollow` has **no avatar field**. Its `thumbnailUrl` is the stream
*preview image*, not the profile picture. `profile_image_url` lives on
`TwitchUser`, and `twitchApi.ts` exposes only single-user lookups
(`getUserByLogin`, `getCurrentUser`).

This is a Helix API shape issue rather than a gap in our code: Twitch
separates *who someone is* (`/users`) from *what they are doing*
(`/streams`). `useFollowedChannels` already performs one join between those
two; the rail needs a second.

`getUsersByIds(ids: string[]): Promise<TwitchUser[]>` batches up to Helix's
100-id cap per request and merges the chunks. Because the rail shows only
**live** follows plus at most 8 recommendations, one request covers the
realistic case — so the quota cost is one call per rail population, not one
per channel.

`useRailAvatars` owns this call and returns a `Map<userId, avatarUrl>`. A
missing or failed entry falls back to an initial-letter circle; avatars never
block the rail from rendering.

**Category section.** `useCategoryRail(gameId, excludeUserId)` calls the
existing `getStreamsByGameId`, then:

1. Sort by `viewer_count` descending.
2. Take the **top 3**.
3. Randomly sample **up to 5** from the remainder.
4. Exclude the currently-playing channel.
5. **Memoize on `gameId`.**

Step 5 is load-bearing. An unmemoized random sample reshuffles on every
render, so the rail rearranges under the cursor while you are reaching for an
avatar. A shuffling rail is unusable.

Step 2/3 together are the point of the feature: the user explicitly wants to
promote streamers beyond the top-of-the-top, so the list is deliberately not
a pure leaderboard.

The 3 + 5 split is chosen to total the per-section cap of 8 (see *Overflow*),
so the recommendations section never truncates and never shows a `+N` — it is
already the full set by construction. Changing either number should keep that
relationship or the two rules will disagree.

---

## Layout and interaction

### Overlay

*(Revised 2026-09-21. The original design gave the rail its own ~60px
gutter and made `TwitchPlayerPage` a flex row. Superseded.)*

The rail is `position: fixed`, pinned to the configured edge, in its own
stacking context above the player and the chat panel. **It does not
participate in layout.** Nothing reflows: the resizable player/chat split on
`/twitch/:channel` keeps its full width and its persisted ratio, and no page
needs to know the rail exists.

Two consequences, both accepted:

- The collapsed strip **occludes a narrow edge of the video** rather than
  shrinking it. Collapsed width is therefore kept minimal and the strip is
  visually recessive.
- Because the rail is fixed rather than in-flow, it stays reachable while
  scrolling to clips and VODs for free — no sticky container needed. A
  channel switcher you must scroll back up to reach is not a switcher.

Overlaying also removes what was the gutter's main justification — keeping
the rail out of a sibling column so `TwitchPlayerPage` could own the flex
row. With a fixed overlay there is no column to own, which is what lets the
same component mount once in `AppLayout` and serve every route.

### Expansion

Expanding widens the same fixed overlay in place. The collapsed strip and the
expanded panel are one element at two widths, not two elements.

**On the iframe.** The original spec argued the gutter was needed because "an
iframe swallows mouse events." That concern does not transfer, and the
reasoning is worth correcting rather than deleting: an iframe only captures
events that land *on the iframe*. The rail sits above it in stacking order,
so pointer events over the rail are delivered to the rail. What would be
unreliable is triggering the rail by hovering the **player itself** — that
event never reaches us. The design never does this: expansion is triggered
only by pointer, focus, or touch landing on the rail.

### Hover intent

Two delays:

- **~120ms before expanding** — sweeping the cursor past a vertical stack of
  avatars must not strobe panels open.
- **~200ms before collapsing** — diagonal travel from avatar to panel must
  not dismiss it mid-move.

Without both, a column of hover targets is unpleasant to use.

### Keyboard and touch

One `expanded` state, three ways in and four ways out:

| Opens on | Closes on |
|---|---|
| `mouseenter` (after the open delay) | `mouseleave` (after the close delay) |
| `focusin` — keyboard tab into the rail | `focusout` |
| tap — touch devices have no hover | `Escape` |
| | tap outside the rail |

Each entry is a link, so keyboard reachability largely follows from correct
markup. Hover-only would make the rail unreachable by keyboard *and* unusable
on tablets; the repo's accessibility is otherwise reasonable and the rail
should not be what breaks it.

No pin or toggle control. Adding persistent chrome to a component whose
entire purpose is staying out of the way defeats it — the three triggers
cover every input type without it.

### Expanded content

Display name, live dot, viewer count, and **stream uptime**. Uptime reuses
`StreamUptime` and `formatUptime` from PR #46 directly — same component, same
formatting, no duplication.

### Position

Persisted at `prism_rail_position`. A small flip control in the rail footer
toggles left/right.

*(Updated 2026-09-21.)* The original note said this key should be added to
the "localStorage key sprawl" list in `docs/TECH-DEBT.md` rather than
quietly appended to the pile. That debt has since been paid: PR #45 landed
`src/config/storageKeys.ts`. The key is therefore registered as
`STORAGE_KEYS.LOCAL_RAIL_POSITION` and must not be written as a raw string
anywhere.

### Overflow

Each section has a **fixed maximum of 8 entries**, not a measured
viewport fit. A `+N` control below a truncated section opens the existing
`FollowingPanel`, where `N` is the number hidden.

A fixed cap rather than dynamic measurement, for three reasons: measuring
requires a resize observer and a layout pass that can flicker on load; two
sections competing for measured space needs an allocation rule that is
arbitrary either way; and a stable, predictable number of avatars is easier
to build muscle memory against. If 8 proves wrong in use it is one constant
to change.

With both sections at cap the strip is 16 avatars plus two section heads,
which fits a 900px viewport at 60px pitch. Shorter viewports scroll the rail
internally; the fixed container scrolls, the page does not.

### Offline follows

Excluded. The rail answers "who can I switch to right now." Offline channels
belong in the panel.

---

## States

| State | Behaviour |
|---|---|
| Logged out | Collapsed rail renders `ConnectTwitchPrompt`. **No API calls are made.** |
| Loading follows | Dimmed placeholder circles at collapsed width. Nothing reflows regardless, since the rail is an overlay. |
| No follows live | Follows section hidden; recommendations still render. |
| Follows fetch fails | Follows section hidden; recommendations unaffected. |
| Avatar fetch fails or partial | Initial-letter circle per missing channel. Rail fully functional. |
| Not on a Twitch channel route | Recommendations section absent — no category in context. Follows render. |
| Channel offline / no `game_id` | Recommendations hidden — no category to draw from. |
| Neither section has content | Rail collapses to the connect prompt if signed out, otherwise unmounts. |

### Invariant: sections fail independently

One section's data failing — expired token, API error, empty result — hides
that section and leaves the others intact. This is the concrete payoff for
not merging platforms into a single hook, and it becomes a multi-platform
guarantee once there is a second platform: YouTube's auth lapsing must not
blank the Twitch rail.

This is a tested invariant, not an aspiration.

### Logged-out behaviour

*(Revised 2026-09-21. The original design hid the rail entirely when logged
out.)*

The collapsed rail renders `ConnectTwitchPrompt` and issues **no API calls**.

The original reasoning still holds and is not being discarded: both halves
need a Twitch token, because Helix requires one on every endpoint including
public data, so there is genuinely no *channel data* to show. What changed is
the conclusion drawn from it. An empty edge of screen explains nothing; a
connect prompt tells the visitor why the rail is empty and what to do about
it, which is the same answer the rest of the signed-out app already gives.

The distinction that matters — and the reason this is not a reversal of the
Defect #5 fix — is between **explaining an absence** and **fabricating a
presence**. Showing demo channels dressed as the user's follow list is the
Defect #5 error and remains forbidden. Showing a prompt that says the list
requires connecting is not; it asserts nothing false. The signed-out channel
page fix (PR #47) resolved to exactly this shape, and the rail matches it.

---

## Relationship to the Following panel

Both surfaces stay. They differ in scope and in job:

| | Rail | Following panel |
|---|---|---|
| Mounted in | `AppLayout` (global, fixed overlay) | `AppLayout` (global, slide-down) |
| Job | Glance and switch | Browse and sort |
| Shows | Live only | Live and offline |
| Controls | Position flip | Sort, pagination |

Both are now global, so the division is job rather than location: the rail is
always-present and glanceable, the panel is opened deliberately. They share
`useFollowedChannels`, so the rail costs no extra follows fetch when the
panel has already populated it.

The rail's `+N` overflow control opens the panel, which makes the division
explicit in the UI rather than leaving two similar surfaces to drift apart.

---

## Dependency: Defect #5 — SATISFIED

**Shipped 2026-09-21** as `c48026e`, "fix: stop presenting the signed-out
channel page as real data" (PR #47, merged). The rail is no longer blocked
on it. The section is kept because it establishes the signed-out contract
the rail's own logged-out behaviour is required to match — see *Logged-out
behaviour*, which now follows the same explain-the-absence shape that fix
settled on.

Original text follows.

### Original: Defect #5 ships first

The logged-out Twitch player page currently renders `StatsRow` with
**CLIPS 0 / HOURS STREAMED 0.0 / 0 VODs / ENGAGEMENT 0.0**, which reads as
fact and is false. Root cause: `TwitchPlayerPage.tsx:64` gates fetching on
auth —

```ts
const channelForApi = isAuthenticated ? (channel ?? null) : null
```

— so `state.channel.profile` stays null, `ProfileSidebar` early-returns at
line 101, and `StatsRow` renders zeros rather than an unknown state.

The missing data is a real API constraint. Rendering zeros instead of a
connect prompt is ours.

This is fixed **before** the rail, as its own PR. It is listed here because
the rail's logged-out behaviour must be consistent with whatever that fix
establishes — both are answers to "what does a signed-out visitor see," and
they should not be designed separately.

---

## Testing

The last three defects shipped because tests covered *behaviour* but never
asserted what **renders**. The rail's tests target output.

- Logged out: rail renders `ConnectTwitchPrompt` and **fires no fetches**
- One avatar per live follow; offline follows excluded
- Expanded panel shows name, live dot, viewer count, and uptime
- Expands on each of hover, focus, and tap
- Collapses on each of mouse-leave, focus-out, `Escape`, and outside tap
- `+N` appears past capacity and opens `FollowingPanel`
- Position flips left/right and survives reload
- Recommendations: top 3 ordered by viewers, current channel excluded
- Recommendations stable across re-renders
- Recommendations section absent on non-Twitch routes; follows still render
- A failing section does not hide its siblings
- Rail does not alter the player/chat split ratio when expanding
- `getUsersByIds`: chunks at 100, merges results, survives one chunk failing,
  issues no request for empty input
- Avatar fetch rejecting still renders the rail, with initial-letter circles
- `ConnectTwitchPrompt`: the four existing call sites render equivalently
  after extraction

**On testing randomness.** The sample is not pinned to exact picks — that is
either flaky or requires injecting a seed for no real benefit. Tests assert
the properties that matter: correct length, disjoint from the top 3, drawn
from the fetched pool, and **identical across re-renders**. The stability
assertion is the one that stops a shuffling rail shipping.

**Mutation checking.** Each test is verified by reintroducing the defect it
guards and confirming it fails, as was done for PR #46. A regression test
never observed failing is not yet known to work.

---

## Debt repaid by this work

`docs/TECH-DEBT.md` lists the connect-prompt markup as duplicated across
four components (`FavoritesCard`, `ProtocolPage`, `StatsRow`,
`ProfileSidebar`). Signed-out, the rail would be a fifth copy, so the
extraction happens here rather than adding to the pile.

## Debt explicitly NOT addressed

`useTwitchAuth` holding auth in per-instance state is a known MEDIUM item,
and the rail becomes a seventh caller. Out of scope: fixing it correctly
means initialising `AppContext` auth from `getStoredToken()`, which changes
first-render behaviour for every signed-in user and does not belong in a
feature PR.

---

## Open questions

None blocking. Deferred by decision:

- `top` rail position — designed for, not built; no rollover state defined yet.
- YouTube and Kick sections — blocked on OAuth that does not exist.

---

## Revision log

### 2026-09-21 — review revisions

**Three decisions changed:**

1. **Gutter → overlay.** The rail no longer takes a ~60px column and
   `TwitchPlayerPage` no longer becomes a flex row. It is a fixed overlay
   and nothing reflows. Accepted cost: the collapsed strip occludes a narrow
   edge of video instead of shrinking it.
2. **Twitch player page → global.** The rail mounts in `AppLayout`. Follows
   render on every route; recommendations remain conditional on a category
   being in context, which only happens on `/twitch/:channel`.
3. **Logged out: hidden → connect prompt.** See *Logged-out behaviour* for
   why this does not reopen Defect #5.

**One defect corrected:**

The spec claimed the Twitch section needed "no new Twitch API calls, no new
quota" while requiring `avatarUrl` on every `RailEntry`. `EnrichedFollow`
carries no avatar — its `thumbnailUrl` is the stream preview. The rail needs
a batched `getUsersByIds()` call that did not exist. The field list in the
original was accurate; only the inference drawn from it was wrong.

**Two facts updated by work that shipped since:**

- Defect #5 is fixed (`c48026e`, PR #47). No longer a blocker.
- `storageKeys.ts` now exists (PR #45), so `LOCAL_RAIL_POSITION` is a
  registry entry rather than a note to add one.
