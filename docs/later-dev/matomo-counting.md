# Count PRISM visits with Matomo (note from the ripTheAnalytics project, 2026-11-17)

Status: **DONE, merged 2026-11-17 as NooRotic/prism#95 (option A below).** The rest of this
note is the reasoning it came from. Written because the work was bigger than a one-line paste: PRISM is a React app with other
branches in flight, it goes live by merging to `main`, and it already has its own usage counter.

## Why

GitHub Pages keeps no server logs, so a visit to prism.nooroticx.tv that arrives from a tagged LinkedIn or YouTube link
(`?utm_source=...`) is not counted anywhere. The owner runs his own Matomo for this (https://stats.pollardjr.com, free,
cookieless, IP masking on at 2 bytes). PRISM is **Matomo site ID 4** (URL https://prism.nooroticx.tv), already created.
The launch post goes out 2026-11-17 and carries a PRISM link tagged `utm_content=post-prism`.

## What PRISM already counts (do not duplicate it blindly)

`src/lib/usageApi.ts` and `src/hooks/usePageHit.ts` send `POST /api/hit` with `{"section": ...}` to the history server
(prism-data.nooroticx.tv) once per navigation that lands on a different path, production builds only, admin pages never.
Nothing about the visitor is sent. It knows **which part of PRISM was opened, not where the visitor came from.**

## Two ways to get "where did they come from"

**A. Matomo block in `index.html`** (the same block as the portfolio and INFERNVS; no server work).
- Site ID 4, address list `{'prism.nooroticx.tv': '4'}`, cookieless, silent for Do Not Track (`"1"` or `"yes"`) and Global
  Privacy Control, and on any other host (localhost, previews).
- Reference copies of the block, with tests: `wsp-portfolio/src/lib/analytics.ts` and `matomoScript()` (portfolio PR), and
  `inferno-map/tools/build.mjs` (`MATOMO`) with its tests in `tools/build.test.mjs` (inferno-map PR 12). Run the block
  against stand-in browser objects in a test, the way those do. Vite note: put it in `index.html` before `</head>`.
- The block adds the class `counted` to `<html>`. Add one visible line somewhere a visitor will see it (a footer or the
  about area), hidden by CSS unless `html.counted`: "Visits are counted by Matomo on my own server, with no cookies and
  shortened IP addresses." The owner decided every counted site carries exactly one such line and the other sites none.
- This is a single-page app with client routing. The first load is counted by the block above, which is all the launch
  needs. Counting each route change as a page view needs `_paq.push(['setCustomUrl', ...]); _paq.push(['trackPageView'])`
  from the same place `usePageHit` lives, guarded the same way.
- The 404 handler in `index.html` rewrites unknown paths into `/?/path`; check a tagged link to a deep path
  (`/twitch/somechannel?utm_source=linkedin`) keeps its `utm_` parameters through it before relying on them.

**B. Extend the existing counter** so `sendHit` also sends the landing page's `utm_source`, `utm_medium`,
`utm_campaign` and `utm_content` (read once at load, and not sent for visitors with Do Not Track or Global Privacy
Control), and have `server/` store them next to the section count. Keeps everything on PRISM's own server and adds no
script, but it is a server change (PHP, its storage, its tests) and PRISM would then have its own small campaign report.

Recommendation: A for the launch (small, reversible, same tools as the other sites), B only if PRISM later wants its own
numbers without Matomo.

## Before merging anything

- Deploy is by merge to `main`; hold until the owner says so. `main` here is behind origin by 4 and other branches
  (`claude/playlist-*`, `feat/stream-checker`) are active: branch from the current `origin/main`.
- Add the unit test first (block against stand-in browser objects), then the note's CSS test.
- Confirm in Matomo that IP masking is still on, since the note says so.
