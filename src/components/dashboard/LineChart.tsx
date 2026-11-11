import { lineCoordinates } from '../../lib/chartGeometry'

interface LineChartProps {
  /** One point per broadcast, oldest first. */
  points: { at: number; value: number }[]
  /** The span the x axis covers, as timestamps. */
  from: number
  to: number
  /** What the chart shows, with its figure and span, for assistive technology. */
  ariaLabel: string
}

// Same drawing size as BarChart, so the three panels keep the same height.
const WIDTH = 300
const HEIGHT = 76
const PAD = 5

/** One dot per broadcast, joined by a line, in the streamer colour. */
export default function LineChart({ points, from, to, ariaLabel }: LineChartProps) {
  const coordinates = lineCoordinates(points, from, to, WIDTH - 2 * PAD, HEIGHT - 2 * PAD)

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      className="block"
    >
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
        {coordinates.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--streamer-text)"
            strokeWidth={2}
            strokeLinejoin="round"
            points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')}
          />
        )}
        {coordinates.map(({ x, y }, i) => (
          <circle key={i} cx={x} cy={y} r={2.5} fill="var(--streamer-text)" />
        ))}
      </g>
    </svg>
  )
}
