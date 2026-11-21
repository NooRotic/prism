/**
 * How often the rail's "Check live" may run, per browser: one check an hour, five in any rolling 24 hours.
 * A check costs about one quota unit per subscription, and the quota (10,000 a day) is shared by every visitor,
 * so the limit is what keeps a curious click from becoming a drain. Counted in localStorage, so it is a
 * courtesy limit, not a wall: clearing site data resets it.
 */
import { STORAGE_KEYS } from '../config/storageKeys'

export const COOLDOWN_MS = 60 * 60 * 1000
export const CHECKS_PER_DAY = 5
const DAY_MS = 24 * 60 * 60 * 1000

export type CheckAllowance = { ok: true } | { ok: false; reason: 'cooldown' | 'daily'; retryAt: number }

function readChecks(now: number): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_YOUTUBE_LIVE_CHECKS) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && now - t < DAY_MS).sort((a, b) => a - b)
  } catch {
    return []
  }
}

/** Whether a check may start now; when not, why and the moment it may. */
export function checkAllowed(now: number = Date.now()): CheckAllowance {
  const checks = readChecks(now)
  if (checks.length === 0) return { ok: true }
  if (checks.length >= CHECKS_PER_DAY) {
    // The oldest check in the window leaves it 24 hours after it was made.
    const retryAt = checks[checks.length - CHECKS_PER_DAY] + DAY_MS
    if (now < retryAt) return { ok: false, reason: 'daily', retryAt }
  }
  const retryAt = checks[checks.length - 1] + COOLDOWN_MS
  if (now < retryAt) return { ok: false, reason: 'cooldown', retryAt }
  return { ok: true }
}

/** Counts a check that is starting (it counts even if it then fails, so a broken network cannot be hammered). */
export function recordCheck(now: number = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_YOUTUBE_LIVE_CHECKS, JSON.stringify([...readChecks(now), now]))
  } catch {
    /* storage unavailable: the limit simply does not hold */
  }
}
