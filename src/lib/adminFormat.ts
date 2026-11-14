import type { DayBucket } from './historyStats'
import type { AdminUsage } from './adminApi'
import { USAGE_SECTIONS } from './usageSections'

const DAY_MS = 86_400_000

/** A whole number with thousands separators, the same wherever the owner's browser is set to. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

/** "+12 vs yesterday", "−3 vs yesterday" or "same as yesterday". */
export function changeVsYesterday(today: number, yesterday: number): string {
  const change = today - yesterday
  if (change === 0) return 'same as yesterday'
  return `${change > 0 ? '+' : '−'}${formatCount(Math.abs(change))} vs yesterday`
}

/** Every section of every day added into ISO weeks (Monday to Sunday, UTC), keyed by the Monday, oldest first. */
export function weeklyTotals(days: AdminUsage['days']): { weekStart: string; total: number }[] {
  const weeks = new Map<string, number>()
  for (const day of days) {
    const at = Date.parse(day.date)
    const sinceMonday = (new Date(at).getUTCDay() + 6) % 7 // Monday 0 ... Sunday 6
    const weekStart = new Date(at - sinceMonday * DAY_MS).toISOString().slice(0, 10)
    const total = USAGE_SECTIONS.reduce((sum, section) => sum + day.counts[section], 0)
    weeks.set(weekStart, (weeks.get(weekStart) ?? 0) + total)
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, total]) => ({ weekStart, total }))
}

/** The existing bar chart takes buckets; the server's dates are UTC days, so `at` is that day's UTC midnight. */
export function toBuckets(days: { date: string; value: number }[]): DayBucket[] {
  return days.map((d) => ({ day: d.date, at: Date.parse(d.date), value: d.value }))
}

/** A server time (`Y-m-d H:i:s`, UTC) or an epoch in milliseconds as "2026-11-12 04:00 UTC". */
export function formatUtc(value: string | number): string {
  const iso = typeof value === 'number' ? new Date(value).toISOString() : value.replace(' ', 'T')
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}
