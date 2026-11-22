# Link Twitch from the YouTube player page (short design)

Owner request 2026-11-22 (step 3 of the YouTube live work); short design approved by the owner the same day.

## Why

Linking should work the same from both sides. Today a link (this Twitch channel is that YouTube channel) can only be
made on the Twitch channel page. The owner's moment: watching a YouTube video or stream, the creator says "watch me
on Twitch", and the owner wants to link them right there.

## Goals

1. **A "Link Twitch" button on `/youtube/:videoId`**, beside the channel name (in `VideoMeta`, next to `AlsoOnTwitch`).
   It reads **Edit links** once this YouTube channel is linked.
2. It opens a small box, "Their Twitch channel": paste `twitch.tv/name`, `https://www.twitch.tv/name` or a bare name.
3. **Same list as the Twitch side** (`linkedAccounts.ts`, one record per Twitch login): a link made here shows as "Also
   on Twitch" here and "Also on YouTube" on the Twitch page, and the reverse.
4. **The same check:** look up the Twitch channel (its bio) and this YouTube channel (its description, 1 unit, only on
   save); both naming each other → `confirmed: true` ("✓ confirmed"), else the viewer's own claim ("linked by you").
5. **Free suggestion:** when the video's own description (already loaded) holds a `twitch.tv/<name>` address, and the
   channel is not linked, offer "Possibly twitch.tv/<name>?" that opens the box filled in; × means "not them",
   remembered per YouTube channel.

## Non-goals / anti-goals

- No Kick box on this side.
- No API call before a click (the suggestion reads the description already on the page).
- Never save an unchecked Twitch name: a link only saves after Twitch says the channel exists.

## Approaches

- **A. A YouTube-side twin of "Link accounts" writing the same list (picked).** Consistent both ways.
- B. A separate YouTube-keyed list: two lists can disagree; rejected.
- C. Send the viewer to the Twitch page to link: loses the moment; rejected.

## Calls made by Claude (owner can override)

- **Not signed in to Twitch:** Twitch answers no channel lookup without a sign-in, so the box says "Sign in to Twitch to
  link this channel." with the sign-in button, instead of saving.
- **Twitch channel already linked to a different YouTube channel:** the box says "<name> is linked to <other title> on
  YouTube. Save to replace it." and the next save replaces it (one YouTube channel per Twitch record).
- **Changing this YouTube channel's link to another Twitch name:** the old Twitch record loses its YouTube part (kept if
  it still has Kick, removed otherwise), so a YouTube channel is never linked to two Twitch channels.
- **A Kick link already on that Twitch record is kept** when saving from here.
- "Remove link" in the box (when linked) removes this YouTube part only, same rule as above.
- Several `twitch.tv/` addresses in a description: the first one is offered.

## Left to the builder

Component and helper names, where the description parser lives, exact copy of minor messages.
