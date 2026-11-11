/** Reads a Twitch video duration such as "1h2m3s" as hours. Text it cannot read counts as 0. */
export function parseTwitchDuration(duration: string): number {
  let hours = 0
  let minutes = 0
  let seconds = 0

  const hMatch = duration.match(/(\d+)h/)
  const mMatch = duration.match(/(\d+)m/)
  const sMatch = duration.match(/(\d+)s/)

  if (hMatch) hours = parseInt(hMatch[1], 10)
  if (mMatch) minutes = parseInt(mMatch[1], 10)
  if (sMatch) seconds = parseInt(sMatch[1], 10)

  return hours + minutes / 60 + seconds / 3600
}
