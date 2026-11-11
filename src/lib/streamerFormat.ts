// Fixed to en-US so the figures read the same everywhere, like the rest of the dashboard's copy.
const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const AXIS_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/** A count rounded to a whole number with thousands separators: `1,284`. */
export function formatWhole(n: number): string {
  return WHOLE.format(n)
}

/** A rank as TwitchTracker writes it: `#18,402`. */
export function formatRank(n: number): string {
  return `#${formatWhole(n)}`
}

/** A change with its sign, zero as `+0`: `+96`, `-12`, `+0`. */
export function formatSigned(n: number): string {
  const rounded = Math.round(n)
  return `${rounded < 0 ? '-' : '+'}${WHOLE.format(Math.abs(rounded))}`
}

/** Hours to one decimal without a trailing `.0`: `41`, `41.5`. */
export function trimHours(hours: number): string {
  return String(Math.round(hours * 10) / 10)
}

/** Hours with a unit: `41h`, `41.5h`. */
export function formatHours(hours: number): string {
  return `${trimHours(hours)}h`
}

/** The local month and day of a timestamp: `Oct 11`. */
export function formatAxisDate(ms: number): string {
  return AXIS_DATE.format(ms)
}
