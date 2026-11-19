# YouTube player page: a real page under the player

Status: DRAFT for owner approval, 2026-11-18. Page: `/youtube/:videoId` (`src/pages/YoutubePlayerPage.tsx`).

## Intent

Today the page is a header, the 16:9 player and a 3-line description. The owner wants to *read* the video's
surroundings without leaving PRISM: the full description and tags, the comments, where they are in a playlist or the
Catch up queue and what is ahead and behind, related videos and related topics. They said they want it to be better
than YouTube's sidebar, and that everything "works fast, just needs to read easier" (so: contrast and size, not
more machinery).

## Goals

- Description (full, expandable), tags, views, upload date, channel: readable at a glance.
- Comments, read-only, with a "Comment on YouTube" button that opens the video's comments on youtube.com.
- A **filmstrip** directly under the player, full width: position ("6 of 23 · Catch up"), previous / next, and real
  thumbnails of the videos behind and ahead, the current one marked.
- Related videos as cards (not tiny list rows); related topics as a row of buttons.
- Card and pill polish on the browse side: upload date next to views on `YouTubeVideoCard`; bigger, higher-contrast
  text on the topic pill row (`YouTubeCategoryBar` / `ExpandablePill`) and the new tag row.

## Non-goals

- Posting a comment from PRISM (needs a write Google scope, a new consent screen, the real account signed in). A
  separate later phase. PRISM stays read-only and never signs the owner out of YouTube.
- Recommendations, Watch History or Watch Later reads: the API has none. Related videos come from the Mix trick.
- Autoplay-next and queue editing. The strip links to videos; it does not manage the queue.

## Anti-goals

- Squeezing the player into a column to make room for a list (the YouTube sidebar the owner does not want).
- Anything that burns the shared 10,000 units/day quota: no search or comment call on page open that is not cached.
- Opening a video that is not the one the owner clicked (the related read uses a hidden, muted player that only
  *cues*, so it cannot write to their History; keep it that way).

## Approaches considered

- **A. Tabs under the player** (About / Comments / Up next / Related): tidy on a phone, but one thing at a time.
- **B. Long scrolling page with jump chips**: shows everything, but on desktop the right column becomes a sidebar.
- **C. Filmstrip + full-width sections (picked by the owner)**: the queue is a wide strip of thumbnails under the
  player, then details, then comments beside related cards. Costs more layout work, same data.

## Design

Layout, top to bottom (desktop; below `md` everything stacks and the strip scrolls sideways):

```
[ player 16:9 ]
◂ 6 of 23 · Catch up ▸   [thumb][thumb][▶ NOW][thumb][thumb][thumb] →
Title · Channel · 1.2M views · Nov 3, 2026
[ TAG ][ TAG ][ TAG ]                 big, high contrast
Description (full text, "Show more")
Comments (wide)                |  Related videos (cards)
Related topics (row of buttons)
```

### Context (what the filmstrip shows)

The address carries where the owner came from: `/youtube/:id?from=catchup` or `/youtube/:id?list=<playlistId>`.
No param: no strip (the page is the details + related sections only).

- **Catch up**: Catch up hands the page the queue it is showing (ids and the light card data it already holds) in a
  snapshot under a new `prism_catchup_*` key, written when a video is opened. The strip reads that snapshot, so it
  costs no API units and still shows the queue the owner was looking at after a reload.
- **`?list=`**: `playlistItems.list`, 1 unit per page of 50, cached; shows a window around the current video (page
  forward as needed). Public and unlisted lists only; a private list shows "Can't read this playlist" and the page
  carries on without the strip.
- The current video is found by id; if it is not in the list, the strip hides rather than guess.

### Data and quota

| What | Source | Cost |
|---|---|---|
| title, channel, views, date, tags, description, `topicDetails` | `videos.list` (add `topicDetails`; same call the page makes now) | 1 unit, cached |
| comments (top-level, by relevance, one page) | `commentThreads.list` | 1 unit, cached per video |
| related ids | `fetchMixIds(videoId)` (hidden muted cue) | 0 |
| related videos' cards | `describeVideos(ids)` | 1 unit per 50 |
| a topic button's results | `search.list` on **click only** | 100 units, cached |
| playlist strip | `playlistItems.list` | 1 unit / 50 |

Caches follow `src/lib/youtubeCache.ts` (localStorage, 24 h TTL); comments get a shorter one. Comments disabled on a
video, no key, or a failed call: the section says so in one line and the rest of the page is unaffected. Every new
API function never throws (same convention as `historyApi`, `streamsApi`).

### Related topics

Buttons come from the video's tags (deduped, capped) and `topicDetails.topicCategories` (Wikipedia names, coarse).
A click opens a cached search (100 units) and shows the results as cards in place; the owner's quota note applies.
Where a click would be wasted (no key) the buttons are plain text.

### Components (suggested)

`VideoMeta` (title row, stats, tags), `DescriptionBlock`, `ContextStrip`, `CommentsSection`, `RelatedVideos`,
`RelatedTopics`; hooks `useVideoPage` (details), `useVideoComments`, `useVideoContext`, `useRelatedVideos`. Data
functions in `youtubeApi.ts` (details with tags, comments, playlist items) and a small `videoContext.ts` for the
snapshot. Styling uses existing tokens: `var(--accent-youtube)`, `--bg-card`, `--border`, `--text-*`.

### Readability

Tags and topic buttons: body-size text (14 px+, not 10-11 px), `--text-primary` on a clearly lighter card than the
page, accent border. Pills keep their hover description. Description at 14 px with 1.6 line height. Contrast checked
against WCAG AA (4.5:1) for the tag text.

## Left to the builder

Exact snapshot shape and TTL; comment page size (suggest 20); how many tags show before "more"; strip window size;
skeleton and error wording; the card's date format (suggest relative under a year, then "Nov 3, 2026").

## Done means

Test-first, full suite, `tsc` and lint green; checked in the browser pane at desktop and 375 px; update `CLAUDE.md`
Key Files; PR opened only with the owner's go.
