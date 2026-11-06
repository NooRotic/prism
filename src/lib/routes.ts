/**
 * A page that plays a video: `/twitch/:channel`, `/youtube/:id`, `/hls-dash/:id`.
 * The listing pages (`/twitch`, `/youtube`, `/hls-dash`) are not.
 */
export function isPlayerPagePath(pathname: string): boolean {
  return /^\/(twitch|youtube|hls-dash)\//.test(pathname)
}
