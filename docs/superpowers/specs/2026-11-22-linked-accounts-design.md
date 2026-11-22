# Linked accounts: "Also on YouTube / Kick" — design

Date: 2026-11-22. Status: approach agreed with the owner in chat (browser-only first, a server-side "Suggest for everyone" later); this is the short design for the first build.

## Intent
A creator is one person on several platforms. On a Twitch channel page PRISM should say where else they are, and later show their Twitch and YouTube VODs in one list. No API says "this Twitch is that YouTube", so the link has to come from a person, or from the creators' own bios.

## Goals
- A "Link accounts" modal on the Twitch channel page: paste a YouTube channel link (and optionally a Kick link) for this channel.
- PRISM checks YouTube itself (one channels.list call, 1 quota unit): it reads the YouTube channel's description and the Twitch description it already has. If each side links the other, the link is marked **confirmed**; otherwise it is saved as **yours** (the viewer's own claim).
- "Also on" chips under the bio: YouTube opens PRISM's "latest from <channel>" grid; Kick opens kick.com in a new tab (PRISM has no Kick player yet).
- Links live in this browser (localStorage) and can be removed.

## Non-goals (this build)
- No server, no admin approval, no sharing between visitors ("Suggest for everyone" is the later step; the record below is the same shape it would send).
- No merged VOD list yet (it will read these records).
- No automatic matching by name. PRISM never guesses.
- Kick cannot be verified (its API needs a server-held token), so a Kick link is always "yours".

## Record
`{ twitch: <login, lower case>, youtube?: { channelId, title, handle? }, kick?: { slug }, confirmed: boolean, linkedAt: <ms> }` in `prism_linked_accounts` (JSON array, newest first, at most 200). One record per Twitch login.

## Parts
- `src/lib/parseAccountLink.ts`: pure; reads a pasted address or handle into `{ platform: 'youtube', handle | channelId }` or `{ platform: 'kick', slug }`, or null.
- `src/lib/linkedAccounts.ts`: the store (get, find by Twitch login, find by YouTube channel id, save, remove). Never throws.
- `src/lib/accountBios.ts`: pure; does a bio mention a Twitch login / a YouTube channel? and `isMutual(...)`.
- `src/lib/youtubeChannelApi.ts`: one channel by handle or id (title, handle, description, thumbnail), cached 24 h, never throws.
- `src/components/channel/LinkedAccounts.tsx` and `LinkAccountsModal.tsx`; mounted under the bio in `ProfileSidebar`.

## Anti-goals
- A wrong "also on" shown as fact. A link is only labelled confirmed when both bios name each other; otherwise it says "linked by you".
- Spending quota unasked: the one call happens when the viewer presses Check.

## Left to later
Reverse chip on the YouTube player page ("Also on Twitch", the store already finds by YouTube channel id), the merged VOD view, the server "Suggest for everyone" + admin approval (needs the P2 backend).

## Update 2026-11-22: the combined videos bar
A linked channel (with a YouTube channel) gets a full-width bar between the profile and the 30-day stats: "Twitch + YouTube videos, together". Both bios naming each other (confirmed) gives it the PRISM spectrum border (a rainbow, deliberately neither Twitch purple nor YouTube red); a link the viewer made gets a plain outline. Clicking opens one list (filter Both / Twitch only / YouTube only, the search grid's Sort by, a loaded count, Load more YouTube) above the existing clips and VOD grids, which are unchanged. Nothing is read from YouTube until it is opened; the Twitch VODs are the ones the page already holds. A Twitch VOD and a YouTube video within 36 hours that share half their title words are tagged "Also on ..." (nothing is hidden). A YouTube card opens PRISM's /youtube/<id> page; a Twitch card plays in the page's player. Not built: a "streams only" filter for YouTube, durations for YouTube (the uploads list does not carry them), Twitch pages beyond the ones loaded.
