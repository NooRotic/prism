/**
 * Kill switch for the TwitchTracker figures on the dashboard's streamer row.
 * TwitchTracker publishes no rate limits, so if it ever blocks this site, set this to
 * false: the client makes no request and the row shows only the Twitch-sourced chips.
 */
export const TWITCHTRACKER_ENABLED = true
