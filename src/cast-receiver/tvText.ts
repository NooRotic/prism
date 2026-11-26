import type { TvState } from '../lib/cast/messages'
import type { EngineReport } from '../lib/cast/tuner'

/** What the debug line is made from. It has no address in it, so the line cannot show one. */
export interface DebugInput {
  state: TvState
  /** Since the current channel was tuned. */
  sinceTuneMs: number
  /** How long the start took, once the picture moved; null before. */
  startedInMs: number | null
  report: EngineReport
  kind: 'hls' | 'dash'
  live: boolean
  /** The channel's place in what Up and Down go through, counting from 1. */
  place: { at: number; of: number } | null
}

const real = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** `mm:ss.cc` */
function stopwatch(ms: number): string | null {
  if (!real(ms)) return null
  const hundredths = Math.floor(ms / 10)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(Math.floor(hundredths / 6000))}:${two(Math.floor(hundredths / 100) % 60)}.${two(hundredths % 100)}`
}

function picture({ width, height }: EngineReport): string | null {
  return real(width) && real(height) && width > 0 && height > 0 ? `${width}×${height}` : null
}

/** Megabits: one decimal under 10, whole above. */
const mbits = (bits: number) => (bits < 1e7 ? (bits / 1e6).toFixed(1) : String(Math.round(bits / 1e6)))

/** A rate of 0 is one the player has not measured yet: left out, like a missing one. */
function rate({ bitrate, bandwidth }: EngineReport): string | null {
  if (!real(bitrate) || bitrate === 0) return null
  const playing = (bitrate / 1e6).toFixed(1)
  return real(bandwidth) && bandwidth > 0 ? `${playing} of ${mbits(bandwidth)} Mb/s` : `${playing} Mb/s`
}

/**
 * One line of what the player is doing, for whoever leans in: while a channel tunes, the time and the player's step; while it
 * plays, the picture and the numbers; when it fails, the player's error first. Anything missing is left out.
 */
export function debugLine({ state, sinceTuneMs, startedInMs, report, kind, live, place }: DebugInput): string {
  const { engine, step } = report
  const where = place ? `ch ${place.at}/${place.of}` : null
  let parts: Array<string | null>
  if (state === 'tuning' || state === 'buffering') {
    parts = [stopwatch(sinceTuneMs), step, engine, kind, where]
  } else if (state === 'playing' || state === 'paused') {
    parts = [
      state.toUpperCase(),
      picture(report),
      rate(report),
      real(report.buffered) ? `buf ${report.buffered.toFixed(1)} s` : null,
      live && real(report.behindLive) ? `behind live ${report.behindLive.toFixed(1)} s` : null,
      real(report.dropped) ? `dropped ${report.dropped}` : null,
      real(startedInMs) ? `start ${(startedInMs / 1000).toFixed(2)} s` : null,
    ]
  } else if (state === 'failed' || state === 'ended') {
    parts = [step, stopwatch(sinceTuneMs), engine, kind]
  } else {
    parts = []
  }
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' · ')
}

export interface ClockText {
  time: string
  period: string | null
  /** The time's pieces, so the separator alone can fade: the locale's own digits are never mistaken for it. */
  hour: string
  separator: string
  minute: string
}

/** The time as the device writes it: its own time zone and 12- or 24-hour habit, with AM / PM apart for a smaller font. */
export function clockParts(date: Date, locale?: string, timeZone?: string): ClockText {
  // A 24-hour clock reads 02:47, as a set-top box shows it; a 12-hour one 2:47.
  const { hourCycle } = new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone }).resolvedOptions()
  const hour = hourCycle === 'h23' || hourCycle === 'h24' ? '2-digit' : 'numeric'
  const parts = new Intl.DateTimeFormat(locale, { hour, minute: '2-digit', timeZone }).formatToParts(date)
  const period = parts.find((part) => part.type === 'dayPeriod')?.value ?? null
  const time = parts
    .filter((part) => part.type !== 'dayPeriod')
    .map((part) => part.value)
    .join('')
    .trim()
  const hourAt = parts.findIndex((part) => part.type === 'hour')
  const minuteAt = parts.findIndex((part) => part.type === 'minute')
  const between = hourAt !== -1 && minuteAt > hourAt ? parts.slice(hourAt + 1, minuteAt) : []
  return {
    time,
    period,
    hour: parts[hourAt]?.value ?? '',
    separator: between.map((part) => part.value).join(''),
    minute: parts[minuteAt]?.value ?? '',
  }
}
