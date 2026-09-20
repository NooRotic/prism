/**
 * Formats elapsed milliseconds as H:MM:SS, matching how Twitch renders
 * stream uptime. Hours deliberately run past 24 (a 30-hour stream reads
 * "30:12:04") rather than rolling over into days.
 */
export function formatUptime(elapsedMs: number): string {
  const total = Math.floor(Math.max(0, elapsedMs) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
