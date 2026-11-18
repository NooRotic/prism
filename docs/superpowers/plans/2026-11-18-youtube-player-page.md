# YouTube Player Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/youtube/:videoId` into a real page: filmstrip of the playlist / Catch up queue under the player, readable details and tags, read-only comments, related videos and topics, plus date-and-views and contrast polish on the browse cards and pills.

**Architecture:** Pure helpers and API functions (never throw, TTL-cached in localStorage) feed four small hooks; presentational components in `src/components/youtube/` are composed by `YoutubePlayerPage`. Context (queue vs playlist) travels in the address (`?from=catchup` / `?list=`); Catch up saves the queue it shows so the strip costs no quota.

**Tech Stack:** Vite 6, React 19, TypeScript, Tailwind v4, Vitest + Testing Library, YouTube Data API v3 (shared key).

**Spec:** `docs/superpowers/specs/2026-11-18-youtube-player-page-design.md`

## Global Constraints

- Quota: 10,000 units/day shared key. Page open may spend only: videos.list 1, commentThreads 1, describeVideos 1 per 50, playlistItems 1 per 50 page. `search.list` (100) only on a topic click, cached.
- Cache pattern follows `src/lib/youtubeCache.ts` (localStorage, 24 h TTL); comments TTL 30 min.
- New API functions never throw; they return a status or `null`/`[]` (as `historyApi`, `streamsApi`).
- Comment text requested with `textFormat=plainText`; never use `dangerouslySetInnerHTML`.
- Read-only: no posting, no new Google scope; "Comment on YouTube" opens `https://www.youtube.com/watch?v=<id>` in a new tab with `rel="noopener noreferrer"`.
- The hidden Mix reader only cues (`fetchMixIds`); never plays, so it cannot write History.
- Tokens: `var(--accent-youtube)`, `--bg-card`, `--border`, `--text-primary|secondary|muted`. Tag / topic text 14 px or larger, AA contrast (4.5:1).
- Env var `VITE_YOUTUBE_API_KEY`; with no key the page still renders (details-less) and topic buttons are plain text.
- Commit messages carry NO Co-Authored-By line. Forward slashes in paths. Tests: `node ./node_modules/vitest/vitest.mjs run <path>`.

## Review Focus

- Comments disabled on a video (403 `commentsDisabled`): one-line message, page otherwise fine. (Task 2, 7)
- Video not in the saved queue / playlist, or snapshot missing after a cleared storage: no strip, no crash. (Task 3)
- Private or removed `?list=` playlist: "Can't read this playlist", page carries on. (Task 2, 4)
- Mix returns nothing (timeout): related section shows an empty note, not an endless spinner. (Task 4)
- Navigating from one video to another reuses the component: stale details/comments of the previous video must never show. (Task 4, 8)
- Description with URLs and blank lines: URLs clickable, line breaks kept, no HTML injected. (Task 5)

## File Structure

- Create `src/lib/videoFormat.ts`: `formatCount`, `formatPublished`, `linkify`.
- Create `src/lib/ttlCache.ts`: tiny localStorage TTL cache.
- Create `src/lib/videoPageApi.ts`: `getVideoPage`, `getComments`, `getPlaylistItems`, `searchTopic`.
- Create `src/lib/videoContext.ts`: address parsing, queue snapshot, window math.
- Create hooks `useVideoPage.ts`, `useVideoComments.ts`, `useVideoContext.ts`, `useRelatedVideos.ts` in `src/hooks/`.
- Create components in `src/components/youtube/`: `TagChip.tsx`, `VideoMeta.tsx`, `DescriptionBlock.tsx`, `ContextStrip.tsx`, `CommentsSection.tsx`, `RelatedVideos.tsx`, `RelatedTopics.tsx`.
- Modify `src/config/storageKeys.ts`, `src/pages/YoutubePlayerPage.tsx`, `src/pages/YoutubeCatchupPage.tsx`, `src/components/youtube/CatchupCard.tsx`, `src/components/grid/YouTubeVideoCard.tsx`, `src/components/grid/YouTubeCategoryBar.tsx`, `src/components/ui/ExpandablePill.tsx`, `CLAUDE.md`.
- Tests beside each in `__tests__/`.

---

### Task 1: Formatting helpers and TTL cache

**Files:** Create `src/lib/videoFormat.ts`, `src/lib/ttlCache.ts`; Modify `src/config/storageKeys.ts` (add `LOCAL_VIDEO_PAGE_CACHE_PREFIX: 'prism_vp_'`); Test `src/lib/__tests__/videoFormat.test.ts`, `ttlCache.test.ts`.

**Interfaces:**
- Produces: `formatCount(n?: string|number): string` ("1.2M views" style without the word: `1.2M`, `34K`, `512`; `''` for undefined/NaN); `formatPublished(iso: string, now = Date.now()): string` (under 1 year: relative `3 days ago`, `2 months ago`; otherwise `Nov 3, 2025`; `''` if unparsable); `linkify(text: string): Array<{ text: string; href?: string }>` (splits on `https?://\S+`, trailing `.,)` not part of the link); `ttlGet<T>(key: string, ttlMs: number, now = Date.now()): T | null`; `ttlSet<T>(key: string, value: T, now = Date.now()): void` (swallow quota errors).

- [ ] **Step 1: Failing tests.** `formatCount('1234567')` → `'1.2M'`; `'999'` → `'999'`; `undefined` → `''`. `formatPublished` with `now` fixed: 3 days before → `'3 days ago'`, 40 days → `'1 month ago'`, 400 days → contains the year. `linkify('see https://a.com/x. ok')` → `[{text:'see '},{text:'https://a.com/x',href:'https://a.com/x'},{text:'. ok'}]`. ttlCache: set then get within TTL returns value; get after TTL returns null; corrupt JSON returns null; `localStorage.setItem` throwing does not throw.
- [ ] **Step 2: Run** the two test files: FAIL (modules missing).
- [ ] **Step 3: Implement** the five functions above (cache entries stored as `{ at, value }`).
- [ ] **Step 4: Run:** PASS.
- [ ] **Step 5: Commit** `feat(youtube): format helpers and a TTL cache`.

### Task 2: Video page API

**Files:** Create `src/lib/videoPageApi.ts`; Test `src/lib/__tests__/videoPageApi.test.ts`.

**Interfaces:**
- Consumes: `ttlGet/ttlSet` (Task 1); `searchYouTubeVideos`, `YouTubeSearchResult` from `youtubeApi.ts`.
- Produces:
  - `interface VideoPageData { id; title; channelTitle; channelId: string; thumbnail; publishedAt; viewCount?: string; description; tags: string[]; topics: string[] }` (`topics` = last path segment of each `topicDetails.topicCategories` URL, `_` → space).
  - `getVideoPage(id: string): Promise<VideoPageData | null>` (videos.list `part=snippet,statistics,topicDetails`, cached 24 h under `prism_vp_video_<id>`).
  - `interface VideoComment { id; author; authorImage: string; text; likeCount: number; publishedAt; replyCount: number }`; `type CommentsResult = { status: 'ok'; comments: VideoComment[]; total?: number } | { status: 'disabled' } | { status: 'error' }`.
  - `getComments(id: string, max = 20): Promise<CommentsResult>` (commentThreads `part=snippet`, `order=relevance`, `textFormat=plainText`; 403 reason `commentsDisabled` → `disabled`; any other failure or no key → `error`; only `ok` cached, 30 min).
  - `interface PlaylistItem { id: string; title: string; thumbnail: string }`; `type PlaylistResult = { status: 'ok'; items: PlaylistItem[]; nextPageToken: string | null } | { status: 'unreadable' }`.
  - `getPlaylistItems(listId: string, pageToken?: string): Promise<PlaylistResult>` (playlistItems `part=snippet,status`, maxResults 50, skips private/deleted entries (`status.privacyStatus` private or title `Deleted video`/`Private video`), cached 24 h).
  - `searchTopic(q: string): Promise<YouTubeSearchResult[]>` (wraps `searchYouTubeVideos(q, 8)`, cached 24 h per lower-cased query, `[]` on any failure).

- [ ] **Step 1: Failing tests** (stub `fetch` and the env key as `catchupApi.test.ts` does): details maps tags and topics (`https://en.wikipedia.org/wiki/Video_game` → `Video game`); tags default `[]`; second call is served from cache (fetch called once); no key → `null`; `getComments` returns `ok` with mapped comments and the request contains `textFormat=plainText`; 403 body `{error:{errors:[{reason:'commentsDisabled'}]}}` → `{status:'disabled'}`; network failure → `{status:'error'}` and nothing cached; `getPlaylistItems` drops a private item and returns `nextPageToken`; 404 → `{status:'unreadable'}`; `searchTopic` second call cached.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** the six exports in `videoPageApi.ts`, each wrapped in try/catch. A private `get(path, params)` adds the key and throws a status-carrying error internally (the exports catch it). Do not modify `youtubeApi.ts`.
- [ ] **Step 4: Run:** PASS.
- [ ] **Step 5: Commit** `feat(youtube): video page API (details, comments, playlist items, topic search)`.

### Task 3: Context helpers and Catch up hand-off

**Files:** Create `src/lib/videoContext.ts`; Modify `src/config/storageKeys.ts` (add `LOCAL_CATCHUP_QUEUE: 'prism_catchup_queue'`), `src/pages/YoutubeCatchupPage.tsx`, `src/components/youtube/CatchupCard.tsx`; Test `src/lib/__tests__/videoContext.test.ts`, extend `src/pages/__tests__/YoutubeCatchupPage.test.tsx` and add a `CatchupCard` link assertion.

**Interfaces:**
- Produces:
  - `type VideoContextSource = { kind: 'catchup' } | { kind: 'playlist'; listId: string } | null`; `parseContext(search: string): VideoContextSource` (`from=catchup` → catchup; `list=<id>` matching `/^[\w-]{10,64}$/` → playlist; `list` wins if both; else null).
  - `interface ContextItem { id: string; title: string; thumbnail: string }`.
  - `writeQueueSnapshot(videos: CatchupVideo[]): void` / `readQueueSnapshot(): ContextItem[]` (stores at most 200 items as `ContextItem`; `[]` on missing or corrupt).
  - `windowAround(items: ContextItem[], currentId: string, behind = 3, ahead = 6): { index: number; total: number; before: ContextItem[]; after: ContextItem[]; prev: ContextItem | null; next: ContextItem | null } | null` (`null` when `currentId` is not in `items`).
  - `contextSearch(source: VideoContextSource): string` (`'?from=catchup'`, `'?list=<id>'`, or `''`), used so strip links keep the context.

- [ ] **Step 1: Failing tests:** each `parseContext` case above; `windowAround` at the start (no `before`, `prev` null), middle, and end (`next` null); missing id → `null`; snapshot round-trip and corrupt JSON → `[]`. Catch up page: after render with a queue, `readQueueSnapshot()` holds the shown ids in order (and follows the lane filter); `CatchupCard` link `href` ends with `?from=catchup`.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** `videoContext.ts`; in `YoutubeCatchupPage` add `useEffect(() => writeQueueSnapshot(shown), [shown])`; change `CatchupCard`'s `to` to `` `/youtube/${video.id}?from=catchup` ``.
- [ ] **Step 4: Run** the three test files: PASS.
- [ ] **Step 5: Commit** `feat(youtube): carry queue / playlist context in the address`.

### Task 4: Hooks

**Files:** Create `src/hooks/useVideoPage.ts`, `useVideoComments.ts`, `useVideoContext.ts`, `useRelatedVideos.ts`; Test `src/hooks/__tests__/videoPageHooks.test.tsx`.

**Interfaces:**
- Consumes: Tasks 2 and 3; `fetchMixIds` (`mixRelated.ts`), `describeVideos` (`catchupApi.ts`).
- Produces (all reset to loading when their id changes, and ignore a late answer for an old id):
  - `useVideoPage(id): { data: VideoPageData | null; status: 'loading' | 'ready' | 'unavailable' }`
  - `useVideoComments(id): { result: CommentsResult | null }` (null while loading)
  - `useVideoContext(id, search: string): { source: VideoContextSource; status: 'none' | 'loading' | 'ready' | 'unreadable'; strip: ReturnType<typeof windowAround> }`. Catch up reads the snapshot; playlist pages through `getPlaylistItems` until the id is found or pages run out (max 5 pages = 250 videos).
  - `useRelatedVideos(id): { videos: CatchupVideo[]; status: 'loading' | 'ready' | 'empty' }` (`fetchMixIds(id)` then `describeVideos(ids.slice(0, 12))`; the described list cached 24 h with `ttlSet` under `prism_vp_related_<id>`).

- [ ] **Step 1: Failing tests** (mock the API modules): data arrives for id A; rerender with id B shows loading and never shows A's data even if A resolves late; playlist `unreadable` → status `unreadable`; id not found in snapshot → `strip` null with status `ready`; Mix `[]` → `empty`.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** the four hooks with a cancelled-flag effect per id (pattern already in `YoutubePlayerPage`).
- [ ] **Step 4: Run:** PASS.
- [ ] **Step 5: Commit** `feat(youtube): hooks for the player page`.

### Task 5: Tags, meta row and description

**Files:** Create `TagChip.tsx`, `VideoMeta.tsx`, `DescriptionBlock.tsx` in `src/components/youtube/`; Test `src/components/youtube/__tests__/VideoMeta.test.tsx`, `contrast.test.ts`.

**Interfaces:**
- Produces: `TagChip({ label: string; onClick?: () => void })` (a `<button>` when `onClick`, else a `<span>`; `text-sm` min, `--text-primary` on a card-tone background with an accent border); `VideoMeta({ data: VideoPageData | null; maxTags?: number })` (title, channel, `formatCount` views, `formatPublished`, tag row with "+N more" toggle, default `maxTags` 8); `DescriptionBlock({ text: string })` (full text, `whitespace-pre-wrap`, clamps at ~6 lines with a "Show more / Show less" button when longer than 400 characters, URLs from `linkify` rendered as `<a target="_blank" rel="noopener noreferrer">`).

- [ ] **Step 1: Failing tests:** meta row shows `1.2M views` and the date text; 12 tags show 8 plus a "+4 more" button that reveals the rest; no tags renders no tag row; description keeps a blank line and renders a URL as a link with `rel` containing `noopener`; a `<script>` string in the text appears as text, not an element; long text toggles "Show more". `contrast.test.ts` reads `--text-primary` and `--bg-card` from `src/index.css` and asserts a contrast ratio ≥ 4.5 (small helper in the test).
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** the three components using `videoFormat` helpers.
- [ ] **Step 4: Run:** PASS.
- [ ] **Step 5: Commit** `feat(youtube): readable meta row, tags and description`.

### Task 6: Context strip

**Files:** Create `src/components/youtube/ContextStrip.tsx`; Test `src/components/youtube/__tests__/ContextStrip.test.tsx`.

**Interfaces:**
- Consumes: `windowAround` result, `VideoContextSource`, `contextSearch`.
- Produces: `ContextStrip({ source: VideoContextSource; status: 'none'|'loading'|'ready'|'unreadable'; strip: ReturnType<typeof windowAround>; currentId: string })`. Renders nothing for `none`; a one-line "Can't read this playlist" note for `unreadable`; for `ready` with a strip: label `6 of 23 · Catch up` (or `· Playlist`), previous/next links (disabled `span` at the ends), thumbnails of `before`, the current one marked `aria-current="true"`, and `after`; each links to `/youtube/<id><contextSearch(source)>`; the row scrolls horizontally and scrolls the current item into view on mount.

- [ ] **Step 1: Failing tests:** label text; current item has `aria-current`; a thumbnail link keeps `?from=catchup` (and `?list=PL…` for a playlist); at the first item "previous" is not a link; `unreadable` message; `none` renders empty container.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement.** Thumbnails `w-32` on phone, `w-40` from `md`; titles `line-clamp-2` at 12 px or larger.
- [ ] **Step 4: Run:** PASS.
- [ ] **Step 5: Commit** `feat(youtube): playlist / queue filmstrip under the player`.

### Task 7: Comments, related videos and related topics

**Files:** Create `CommentsSection.tsx`, `RelatedVideos.tsx`, `RelatedTopics.tsx`; Test `src/components/youtube/__tests__/sections.test.tsx`.

**Interfaces:**
- Consumes: `CommentsResult`, `CatchupVideo`, `searchTopic`, `TagChip`.
- Produces:
  - `CommentsSection({ videoId: string; result: CommentsResult | null })`: skeleton while null; each comment shows author, `formatPublished`, text (`whitespace-pre-wrap`), likes and reply count; `disabled` → "Comments are turned off for this video."; `error` → "Couldn't load comments."; a "Comment on YouTube" link (always present) as specified in Global Constraints.
  - `RelatedVideos({ videos: CatchupVideo[]; status: 'loading'|'ready'|'empty' })`: card grid that links each video to `/youtube/<id>` with no context (a related click starts a fresh context). Reuse `CatchupCard`'s look through a new optional `href?: string` prop on `CatchupCard` (default stays `?from=catchup`; pass the bare path here).
  - `RelatedTopics({ topics: string[]; apiAvailable: boolean })`: `TagChip` row; with `apiAvailable` a click runs `searchTopic(topic)` and shows the results as cards under the row ("Searching…" then results or "Nothing found"); without it, chips are plain.

- [ ] **Step 1: Failing tests:** `disabled` and `error` messages; "Comment on YouTube" href `https://www.youtube.com/watch?v=abc` with `rel` containing `noopener`; a comment's text containing `<b>x</b>` renders as text; related `empty` note; clicking a topic calls `searchTopic` once with the label and renders a result; `apiAvailable={false}` renders no buttons.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run:** PASS.
- [ ] **Step 5: Commit** `feat(youtube): comments, related videos and topics sections`.

### Task 8: Compose the page

**Files:** Modify `src/pages/YoutubePlayerPage.tsx`; Test `src/pages/__tests__/YoutubePlayerPage.test.tsx` (create; mock the four hooks and `PlayerHost`).

**Interfaces:** Consumes Tasks 4-7. Keeps the existing behaviors: `recordWatched`, demo ids, `PLAY_URL` dispatch, `DebugPanel`.

- [ ] **Step 1: Failing tests:** with mocked hooks, page shows (in DOM order) player, `ContextStrip`, title and views, tags, description, comments, related videos, related topics; with `status: 'none'` no strip; the topic row gets topics = `tags` ∪ `topics` (deduped, case-insensitive, max 12); changing the route id calls `recordWatched` with the new id and scrolls the window to the top.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** the layout from the spec: `max-w-5xl` stays for the player and strip; the comments / related split uses `lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]` and stacks below `lg`. Replace the old header and description block.
- [ ] **Step 4: Run:** PASS, then the whole `src/pages` and `src/components/youtube` folders.
- [ ] **Step 5: Commit** `feat(youtube): the player page, composed`.

### Task 9: Browse card and pill polish

**Files:** Modify `src/components/grid/YouTubeVideoCard.tsx`, `YouTubeCategoryBar.tsx`, `src/components/ui/ExpandablePill.tsx`; Test the existing `__tests__` for these (extend).

- [ ] **Step 1: Failing tests:** `YouTubeVideoCard` shows the upload date (`formatPublished`) beside the channel and the views badge uses `formatCount` + " views"; the existing views text keeps passing; `ExpandablePill` label has class `text-sm` or larger (no `text-xs`) and its idle border is no dimmer than `rgba(255,255,255,0.25)`; `YouTubeCategoryBar` pills inherit it.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement.** Remove the card's local `formatViews` in favour of `formatCount`; raise pill text to `text-sm`, label colour to `--text-primary` when idle, idle border `rgba(255,255,255,0.25)`.
- [ ] **Step 4: Run:** PASS, including every other test that renders `ExpandablePill` (HLS pills, Header).
- [ ] **Step 5: Commit** `feat(youtube): date and views on cards, larger higher-contrast pills`.

### Task 10: Verify and document

- [ ] **Step 1:** Update `CLAUDE.md` Key Files with one entry for the player page parts (`videoPageApi.ts`, `videoContext.ts`, the hooks, `src/components/youtube/`).
- [ ] **Step 2:** Full suite in the background: `node ./node_modules/vitest/vitest.mjs run > scratch.txt`; then `node ./node_modules/typescript/bin/tsc -b` and `node ./node_modules/eslint/bin/eslint.js .`. Expected: all green (a transient `UNKNOWN ... aria-query` load failure: re-run first).
- [ ] **Step 3:** Dev server `node ./node_modules/vite/bin/vite.js --port 5001`; open `/youtube/<id>?from=catchup` (seed `prism_catchup_queue` via the console if needed) and `/youtube/<id>?list=<a public playlist id>` at desktop and 375 px in the browser pane. Check strip, tags, description, comments, related, topic click, no horizontal page scroll. Needs `VITE_YOUTUBE_API_KEY` (worktree has no `.env`; ask the owner to copy theirs).
- [ ] **Step 4:** Commit `docs: key files for the YouTube player page`. Do NOT push or open a PR without the owner's go.
