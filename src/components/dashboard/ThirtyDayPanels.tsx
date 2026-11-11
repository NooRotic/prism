import type { ReactNode } from 'react'
import type { Section } from '../../hooks/streamerSection'
import type { FollowerHistory, VideoHistory } from '../../hooks/useStreamerHistory'
import type { DayBucket } from '../../lib/historyStats'
import { formatAxisDate, formatHours, formatSigned, trimHours } from '../../lib/streamerFormat'
import type { TrackerSummary } from '../../lib/twitchTracker'
import BarChart from './BarChart'
import LineChart from './LineChart'

interface ThirtyDayPanelsProps {
  followers: Section<FollowerHistory>
  videos: Section<VideoHistory>
  /** TwitchTracker's 30-day summary, the source of the big numbers when it has one. */
  tracker: TrackerSummary | null
  now: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const MISSING = '–'
const LOADING = '…'

const sumOf = (buckets: DayBucket[]) => buckets.reduce((total, b) => total + (b.value ?? 0), 0)

function TrackerTag() {
  return (
    <span
      className="ml-1.5 rounded px-1 align-middle text-[9px] font-normal"
      style={{ color: 'var(--streamer-label)', border: '1px solid var(--streamer-border)' }}
    >
      TT
    </span>
  )
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </p>
  )
}

function Axis({ from, to }: { from: number; to: number }) {
  return (
    <div className="flex justify-between text-[9px]" style={{ color: 'var(--text-secondary)' }}>
      <span>{formatAxisDate(from)}</span>
      <span>{formatAxisDate(from + (to - from) / 2)}</span>
      <span>{formatAxisDate(to)}</span>
    </div>
  )
}

/** A big figure: the text, whether it comes from TwitchTracker, and the number behind it for the chart label. */
interface Figure {
  text: string
  tracker: boolean
  amount: number
}

function Panel({
  title,
  figure,
  loading,
  children,
}: {
  title: string
  figure: Figure | string | null
  loading: boolean
  children: ReactNode
}) {
  const big = typeof figure === 'string' ? figure : figure ? figure.text : loading ? LOADING : MISSING
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-1.5 rounded-md p-3"
      style={{ backgroundColor: 'var(--bg-card-hover)' }}
    >
      <h4 className="m-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--streamer-label)' }}>
        {title}
      </h4>
      <div className="min-h-[28px] text-lg font-bold" style={{ color: 'var(--streamer-text)' }}>
        {big}
        {typeof figure === 'object' && figure?.tracker && <TrackerTag />}
      </div>
      {children}
    </section>
  )
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function recordingsNote(coverageDays: number | null): ReactNode {
  if (coverageDays === null || coverageDays >= 30) return null
  return <Caption>Only broadcasts Twitch still keeps appear: recordings go back {plural(coverageDays, 'day')}.</Caption>
}

/**
 * The streamer's last 30 days as three panels. Each has a big number, from TwitchTracker when it
 * has one (tagged TT) and otherwise from what the chart itself sums, and a small chart built from
 * Twitch's own data (followers by the day they followed, the broadcast recordings). The two are
 * different things and the panels say so. A section that fails shows a dash and its own message
 * while the others render.
 */
export default function ThirtyDayPanels({ followers, videos, tracker, now }: ThirtyDayPanelsProps) {
  // --- Followers ---
  const followerData = followers.data
  const followerSum = followerData ? sumOf(followerData.buckets) : null
  const gained = tracker?.followersGained ?? null
  const followerFigure: Figure | null =
    gained !== null
      ? { text: formatSigned(gained), tracker: true, amount: gained }
      : followerSum !== null
        ? { text: formatSigned(followerSum), tracker: false, amount: followerSum }
        : null
  const reached = followerData?.reachedCap ? followerData.buckets.find((b) => b.value !== null) : undefined
  const followerLabel = followerData
    ? `Followers gained per day, ${reached ? `since ${formatAxisDate(reached.at)}` : 'last 30 days'}, total ${
        reached ? followerSum : followerFigure?.amount
      }`
    : ''

  // --- Recordings ---
  const videoData = videos.data
  const hasRecordings = videoData !== null && videoData.coverageDays !== null
  const streams = videoData?.views.length ?? null
  const hoursSum = videoData ? sumOf(videoData.hours) : null
  const trackedHours = tracker?.minutesStreamed != null ? tracker.minutesStreamed / 60 : null
  const hoursFigure: Figure | null =
    trackedHours !== null
      ? { text: formatHours(trackedHours), tracker: true, amount: trackedHours }
      : hasRecordings && hoursSum !== null
        ? { text: formatHours(hoursSum), tracker: false, amount: hoursSum }
        : null
  const windowStart = videoData?.hours[0]?.at ?? now - 29 * DAY_MS

  const noRecordings = <Caption>No recordings found, so there is nothing to chart here yet.</Caption>
  const couldNotLoadFollowers = <Caption>Couldn’t load your follower history.</Caption>
  const couldNotLoadVideos = <Caption>Couldn’t load your recordings.</Caption>

  return (
    <section
      aria-label="Last 30 days panels"
      className="flex flex-col gap-2 rounded-md p-3"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h3 className="m-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--streamer-text)' }}>
          Last 30 days
        </h3>
        <p className="m-0 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Numbers tagged TT are from TwitchTracker; chart shapes are from Twitch (your followers and recordings)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Panel title="Followers" figure={followerFigure} loading={followers.loading}>
          {followerData && (
            <>
              <BarChart buckets={followerData.buckets} ariaLabel={followerLabel} />
              <Axis from={followerData.buckets[0].at} to={followerData.buckets[followerData.buckets.length - 1].at} />
            </>
          )}
          {followers.error !== null && couldNotLoadFollowers}
          <Caption>New followers per day, from the dates people followed you. Shows gains only: Twitch does not list who left.</Caption>
          {reached && (
            <Caption>
              The bars cover only the span reached (since {formatAxisDate(reached.at)}): PRISM reads at most 1,000
              followers.
            </Caption>
          )}
        </Panel>

        <Panel
          title="Views per stream"
          figure={streams === null ? null : plural(streams, 'stream')}
          loading={videos.loading}
        >
          {videoData && hasRecordings && (
            <>
              <LineChart
                points={videoData.views}
                from={windowStart}
                to={now}
                ariaLabel={`Views per broadcast, last 30 days, ${plural(videoData.views.length, 'broadcast')}`}
              />
              <Axis from={windowStart} to={now} />
            </>
          )}
          {videoData && !hasRecordings && noRecordings}
          {videos.error !== null && couldNotLoadVideos}
          <Caption>
            One point per broadcast: views of its recording (not live viewers). Recordings keep gaining views after a
            stream, so older points are not comparable with newer ones.
          </Caption>
          {recordingsNote(videoData?.coverageDays ?? null)}
        </Panel>

        <Panel title="Time streamed" figure={hoursFigure} loading={videos.loading}>
          {videoData && hasRecordings && (
            <>
              <BarChart
                buckets={videoData.hours}
                ariaLabel={`Hours streamed per day, last 30 days, total ${trimHours(hoursFigure?.amount ?? 0)} hours`}
              />
              <Axis from={videoData.hours[0].at} to={videoData.hours[videoData.hours.length - 1].at} />
            </>
          )}
          {videoData && !hasRecordings && noRecordings}
          {videos.error !== null && couldNotLoadVideos}
          <Caption>Hours streamed each day, added up from the length of your recordings.</Caption>
          {recordingsNote(videoData?.coverageDays ?? null)}
        </Panel>
      </div>
    </section>
  )
}
