import { barHeights } from '../../lib/chartGeometry'
import type { DayBucket } from '../../lib/historyStats'

interface BarChartProps {
  /** One bucket per day, oldest first. A null value draws no bar; a 0 draws a grey stub. */
  buckets: DayBucket[]
  /** What the chart shows, with its figure and span, for assistive technology. */
  ariaLabel: string
}

// A fixed drawing size, scaled by the browser: every chart on the page then keeps the same
// proportions, whatever the width of its panel.
const WIDTH = 300
const HEIGHT = 76

/** Daily bars in the streamer colour. Each day keeps its own slot, so an unknown day leaves a gap. */
export default function BarChart({ buckets, ariaLabel }: BarChartProps) {
  const heights = barHeights(
    buckets.map((b) => b.value),
    HEIGHT,
  )
  const slot = WIDTH / Math.max(1, buckets.length)

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
      {buckets.map((bucket, i) => {
        const height = heights[i]
        if (height === null) return null
        const isZero = (bucket.value ?? 0) <= 0
        return (
          <rect
            key={bucket.day}
            data-kind={isZero ? 'zero' : 'bar'}
            x={i * slot + slot * 0.1}
            y={HEIGHT - height}
            width={slot * 0.8}
            height={height}
            rx={1}
            fill={isZero ? 'var(--border-accent)' : 'var(--streamer-text)'}
            opacity={isZero ? 1 : 0.85}
          />
        )
      })}
    </svg>
  )
}
