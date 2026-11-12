import { sharedRange, trendSegments } from '../../lib/chartGeometry'

export interface TrendSeries {
  /** One point per UTC day, oldest first. A null value is a gap in the data. */
  points: { at: number; value: number | null }[]
  /** Any CSS colour; the first and second series default to the streamer colours. */
  stroke?: string
}

interface TrendChartProps {
  /** One or more series, drawn on one shared scale. */
  series: TrendSeries[]
  /** The span the x axis covers, as timestamps. */
  from: number
  to: number
  /** What the chart shows, with its figure and span, for assistive technology. */
  ariaLabel: string
  /** Draw the smallest value at the top, for a rank where lower is better. */
  invert?: boolean
}

// Same drawing size as BarChart and LineChart, so panels side by side keep the same height.
const WIDTH = 300
const HEIGHT = 76
const PAD = 5
const DEFAULT_STROKES = ['var(--streamer-text)', 'var(--streamer-label)']

/**
 * Lines for values that are not measured from zero (a follower total, a rank, TwitchTracker's rolling viewer
 * numbers). The scale runs from the smallest to the largest value shown, so a small change is visible, and a
 * day with no data breaks the line instead of being joined across.
 */
export default function TrendChart({ series, from, to, ariaLabel, invert = false }: TrendChartProps) {
  const range = sharedRange(series.map((s) => s.points)) ?? undefined

  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" className="block">
      <line
        x1={0}
        y1={HEIGHT - 0.5}
        x2={WIDTH}
        y2={HEIGHT - 0.5}
        stroke="var(--border-accent)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <g transform={`translate(${PAD} ${PAD})`}>
        {series.map((s, index) => {
          const stroke = s.stroke ?? DEFAULT_STROKES[index % DEFAULT_STROKES.length]
          const segments = range ? trendSegments(s.points, from, to, WIDTH - 2 * PAD, HEIGHT - 2 * PAD, { invert, range }) : []
          return segments.map((segment, i) =>
            segment.length > 1 ? (
              <polyline
                key={`${index}-${i}`}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                strokeLinejoin="round"
                points={segment.map(({ x, y }) => `${x},${y}`).join(' ')}
              />
            ) : (
              <circle key={`${index}-${i}`} cx={segment[0].x} cy={segment[0].y} r={2.5} fill={stroke} />
            ),
          )
        })}
      </g>
    </svg>
  )
}
