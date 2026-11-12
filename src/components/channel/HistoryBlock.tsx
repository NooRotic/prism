import type { ReactNode } from 'react'
import type { ChannelHistoryState } from '../../hooks/useChannelHistory'
import type { ChannelHistory, HistoryRow } from '../../lib/historyApi'
import { compactCount } from '../../lib/dashboardStats'
import {
  ROLLING_TITLES,
  formatHistoryDate,
  formatTrackingSince,
  growthOver,
  isStale,
  seriesOf,
  type SeriesPoint,
} from '../../lib/historyGrowth'
import { formatHours, formatRank, formatSigned, formatWhole } from '../../lib/streamerFormat'
import TrendChart from '../dashboard/TrendChart'

interface HistoryBlockProps {
  state: ChannelHistoryState
  now: number
  /** Only the charts: for the viewer's own channel, whose TwitchTracker numbers the streamer row already shows. */
  chartsOnly?: boolean
}

const DAY_MS = 86_400_000
const MISSING = '–'
const NO_CHART = 'Chart appears once there are two days of history'

const NOTICES: Partial<Record<ChannelHistory['ttStatus'], string>> = {
  untracked: 'TwitchTracker does not track this channel yet',
  pending: 'TwitchTracker figures are on their way',
  error: 'TwitchTracker figures are unavailable right now',
}

const known = (points: SeriesPoint[]): SeriesPoint[] => points.filter((p) => p.value !== null)
const hasChart = (points: SeriesPoint[]): boolean => known(points).length >= 2

function Credit({ login }: { login: string }) {
  return (
    <span>
      Data:{' '}
      <a
        href={`https://twitchtracker.com/${encodeURIComponent(login)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        style={{ color: 'var(--text-primary)' }}
      >
        TwitchTracker
      </a>
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

interface Chip {
  label: string
  /** The text to show, or null when the figure is not available. */
  value: string | null
  large?: boolean
}

function chips(latest: HistoryRow): Chip[] {
  const from = (value: number | null, format: (n: number) => string): string | null => (value === null ? null : format(value))
  return [
    { label: 'Rank', value: from(latest.rank, formatRank), large: true },
    { label: 'Followers', value: from(latest.followersTotal, formatWhole) },
    { label: 'Followers gained', value: from(latest.followersChange, formatSigned) },
    { label: 'Avg viewers', value: from(latest.avgViewers, formatWhole) },
    { label: 'Peak viewers', value: from(latest.maxViewers, formatWhole) },
    { label: 'Hours streamed', value: from(latest.minutesStreamed, (m) => formatHours(m / 60)) },
    { label: 'Hours watched', value: from(latest.hoursWatched, (h) => compactCount(Math.round(h))) },
  ]
}

/** `7d +70 · 30d +300`: the windows the history reaches, for a figure that is measured on the day (not a rolling one). */
function Growth({ rows, kind }: { rows: HistoryRow[]; kind: 'followers' | 'rank' }) {
  const key = kind === 'followers' ? 'followersTotal' : 'rank'
  const parts: string[] = []
  for (const days of [7, 30, 90] as const) {
    const growth = growthOver(rows, key, days)
    if (growth === null) continue
    if (kind === 'followers') {
      parts.push(`${days}d ${formatSigned(growth.delta)}`)
    } else if (growth.delta < 0) {
      parts.push(`${days}d up ${formatWhole(-growth.delta)}`)
    } else if (growth.delta > 0) {
      parts.push(`${days}d down ${formatWhole(growth.delta)}`)
    } else {
      parts.push(`${days}d no change`)
    }
  }
  if (parts.length === 0) return null
  return (
    <p className="m-0 text-[11px]" style={{ color: 'var(--streamer-text)' }}>
      {parts.join(' · ')}
    </p>
  )
}

interface PanelProps {
  title: string
  figure: string | null
  chart: ReactNode
  axis: { from: string; to: string } | null
  children?: ReactNode
}

/** One chart panel: title, the latest figure, a chart slot that keeps its size whether or not there is a chart, then notes. */
function Panel({ title, figure, chart, axis, children }: PanelProps) {
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
        {figure ?? MISSING}
      </div>
      <div
        data-slot="chart"
        className="aspect-[300/76] w-full overflow-hidden rounded-sm"
        style={chart ? undefined : { backgroundColor: 'var(--bg-card)' }}
      >
        {chart ?? (
          <p className="m-0 p-2 text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {NO_CHART}
          </p>
        )}
      </div>
      <div data-slot="axis" className="flex min-h-[14px] justify-between text-[9px]" style={{ color: 'var(--text-secondary)' }}>
        {axis && (
          <>
            <span>{formatHistoryDate(axis.from)}</span>
            <span>{formatHistoryDate(axis.to)}</span>
          </>
        )}
      </div>
      {children}
    </section>
  )
}

/** The chart and axis for a panel, or nothing while its first series has fewer than two points. */
function chartFor(seriesList: SeriesPoint[][], label: (first: SeriesPoint, last: SeriesPoint) => string, invert = false) {
  const base = seriesList[0]
  if (!hasChart(base)) return { chart: null, axis: null }
  const withValues = known(base)
  const first = withValues[0]
  const last = withValues[withValues.length - 1]
  return {
    chart: (
      <TrendChart
        series={seriesList.map((points) => ({ points }))}
        from={base[0].at}
        to={base[base.length - 1].at}
        ariaLabel={label(first, last)}
        invert={invert}
      />
    ),
    axis: { from: base[0].date, to: base[base.length - 1].date },
  }
}

/**
 * What the history server knows about a channel: TwitchTracker's 30-day numbers and charts that grow day by
 * day from when the server started tracking it. It shows nothing until the server has answered, and nothing
 * if it never does, so the page is the same as before when the server is down.
 *
 * The viewer and hours figures are TwitchTracker's rolling 30-day numbers, so their charts say so and show
 * no growth; only total followers and rank are measured on the day and get 7/30/90-day growth.
 */
export default function HistoryBlock({ state, now, chartsOnly = false }: HistoryBlockProps) {
  if (state.status !== 'ready') return null
  const data = state.data
  // Figures come only from a row TwitchTracker actually answered. For a channel it does not know the server's
  // newest row is an all-null 'untracked' one, which must not turn into seven dash chips and four empty panels.
  const latest = data.latest !== null && data.latest.ttStatus === 'ok' ? data.latest : null
  if (chartsOnly && latest === null) return null

  const followers = seriesOf(data.history, 'followersTotal')
  const rank = seriesOf(data.history, 'rank')
  const avg = seriesOf(data.history, 'avgViewers')
  const peak = seriesOf(data.history, 'maxViewers')
  const hours = seriesOf(data.history, 'hoursWatched')

  const followersChart = chartFor([followers], (a, b) => `Total followers, ${formatWhole(a.value ?? 0)} on ${formatHistoryDate(a.date)} to ${formatWhole(b.value ?? 0)} on ${formatHistoryDate(b.date)}`)
  const rankChart = chartFor([rank], (a, b) => `Rank, ${formatRank(a.value ?? 0)} on ${formatHistoryDate(a.date)} to ${formatRank(b.value ?? 0)} on ${formatHistoryDate(b.date)}, lower is better`, true)
  const viewersChart = chartFor([avg, peak], (a, b) => `${ROLLING_TITLES.viewers}, ${formatHistoryDate(a.date)} to ${formatHistoryDate(b.date)}`)
  const hoursChart = chartFor([hours], (a, b) => `${ROLLING_TITLES.hours}, ${formatHistoryDate(a.date)} to ${formatHistoryDate(b.date)}`)

  const stale = latest !== null && isStale(data.lastUpdated, now)
  const daysOld = data.lastUpdated === null ? 0 : Math.floor((now - Date.parse(data.lastUpdated)) / DAY_MS)
  const notice = NOTICES[data.ttStatus]

  return (
    <section
      aria-label="Channel history"
      className="@container flex flex-col gap-2 rounded-md p-3"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h3 className="m-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--streamer-text)' }}>
          {chartsOnly ? 'History' : 'Last 30 days'}
        </h3>
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          <Credit login={data.login} />
          <span>{`Tracking since ${formatTrackingSince(data.trackedSince)}`}</span>
          {stale && (
            <span className="rounded px-1.5" style={{ color: 'var(--streamer-label)', border: '1px solid var(--streamer-border)' }}>
              {`Updated ${daysOld} days ago`}
            </span>
          )}
        </p>
      </div>

      {notice && (
        <p className="m-0 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {notice}
        </p>
      )}

      {!chartsOnly && latest !== null && (
        <ul aria-label="Channel stats" className="m-0 grid list-none grid-cols-2 gap-2 p-0 @lg:flex @lg:flex-wrap">
          {chips(latest).map((chip) => (
            <li
              key={chip.label}
              title="TwitchTracker, last 30 days"
              className="min-h-[52px] rounded-md px-3 py-2"
              style={{ backgroundColor: 'var(--streamer-box)', border: '1px solid var(--streamer-border)' }}
            >
              <small className="block text-[10px] uppercase tracking-wider" style={{ color: 'var(--streamer-label)' }}>
                {chip.label}
              </small>
              <b className={chip.large ? 'text-base' : 'text-sm'} style={{ color: 'var(--streamer-text)', fontFamily: 'var(--font-mono)' }}>
                {chip.value ?? MISSING}
                <span
                  className="ml-1.5 rounded px-1 align-middle text-[9px] font-normal"
                  style={{ color: 'var(--streamer-label)', border: '1px solid var(--streamer-border)' }}
                >
                  TT
                </span>
              </b>
            </li>
          ))}
        </ul>
      )}

      {latest !== null && (
        <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @5xl:grid-cols-4">
          <Panel
            title="Total followers"
            figure={latest.followersTotal === null ? null : formatWhole(latest.followersTotal)}
            chart={followersChart.chart}
            axis={followersChart.axis}
          >
            <Growth rows={data.history} kind="followers" />
            <Caption>Total followers on each day recorded, from TwitchTracker.</Caption>
          </Panel>

          <Panel title="Rank" figure={latest.rank === null ? null : formatRank(latest.rank)} chart={rankChart.chart} axis={rankChart.axis}>
            <Growth rows={data.history} kind="rank" />
            <Caption>Rank by hours watched; lower is better, so the line rises as the channel climbs.</Caption>
          </Panel>

          <Panel
            title={ROLLING_TITLES.viewers}
            figure={
              latest.avgViewers === null && latest.maxViewers === null
                ? null
                : `${latest.avgViewers === null ? MISSING : formatWhole(latest.avgViewers)} avg · ${latest.maxViewers === null ? MISSING : formatWhole(latest.maxViewers)} peak`
            }
            chart={viewersChart.chart}
            axis={viewersChart.axis}
          >
            <p className="m-0 flex gap-3 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              <span>
                <span aria-hidden style={{ color: 'var(--streamer-text)' }}>■ </span>
                <span>Average</span>
              </span>
              <span>
                <span aria-hidden style={{ color: 'var(--streamer-label)' }}>■ </span>
                <span>Peak</span>
              </span>
            </p>
            <Caption>Each point is TwitchTracker's figure for the 30 days up to that date, not for the day itself.</Caption>
          </Panel>

          <Panel
            title={ROLLING_TITLES.hours}
            figure={latest.hoursWatched === null ? null : compactCount(Math.round(latest.hoursWatched))}
            chart={hoursChart.chart}
            axis={hoursChart.axis}
          >
            <Caption>Each point is the hours watched in the 30 days up to that date, not on the day itself.</Caption>
          </Panel>
        </div>
      )}
    </section>
  )
}
