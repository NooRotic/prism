# PRISM — Player Routing & Insight for Streaming Media

## Architecture
- **Stack**: Vite 6 + React 19 + TypeScript + Tailwind CSS v4
- **State**: React Context + useReducer (AppContext.tsx)
- **Video**: Twitch Embed JS SDK (primary), Video.js (HLS), dashjs (DASH), react-player (YouTube)
- **Deploy**: Static export to GitHub Pages

## Conventions
- Use `var(--accent-green)` (#39FF14) for primary accent, `var(--accent-twitch)` (#9146FF) for Twitch
- Player components expose `{ onReady, onError, onPlay, onPause, onOffline, onOnline, onEnded, onPlaybackBlocked }` interface (all optional)
- All Twitch API calls go through `lib/twitchApi.ts`
- Auth state managed by `useTwitchAuth` hook
- Env vars prefixed with `VITE_` (not NEXT_PUBLIC_)

## Key Files
- `src/lib/urlDetection.ts` - URL classification engine
- `src/lib/twitchApi.ts` - Twitch Helix API client
- `src/lib/twitchAuth.ts` - OAuth Implicit Grant Flow
- `src/contexts/AppContext.tsx` - Global state
- `src/components/player/PlayerHost.tsx` - Video player with fallback chain

## Design Spec
Full spec at `docs/superpowers/specs/2026-04-06-prism-design.md`

## Windows
- Use forward slashes in paths
- Use bash shell syntax
