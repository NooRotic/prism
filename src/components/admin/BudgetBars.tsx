import { barHeights } from '../../lib/chartGeometry'

interface BudgetBarsProps {
  /** One entry per UTC day, oldest first. */
  days: { date: string; calls: number }[]
  /** The daily budget, drawn as a dashed line. */
  budget: number
  /** What the chart shows, for assistive technology. */
  ariaLabel: string
}

// The same drawing size as the other charts, so every panel keeps its proportions.
const WIDTH = 300
const HEIGHT = 76

/**
 * Daily bars with the budget as a dashed line. The budget is added to the values the heights are scaled from, so
 * the bars and the line share one scale: a day that reaches the line has used its whole budget.
 */
export default function BudgetBars({ days, budget, ariaLabel }: BudgetBarsProps) {
  const heights = barHeights([...days.map((d) => d.calls), budget], HEIGHT)
  const budgetY = HEIGHT - (heights[heights.length - 1] ?? 0)
  const slot = WIDTH / Math.max(1, days.length)

  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" className="block">
      <line x1={0} y1={HEIGHT - 0.5} x2={WIDTH} y2={HEIGHT - 0.5} stroke="var(--border-accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {days.map((day, i) => {
        const height = heights[i]
        if (height === null) return null
        const over = day.calls > budget
        return (
          <rect
            key={day.date}
            x={i * slot + slot * 0.1}
            y={HEIGHT - height}
            width={slot * 0.8}
            height={height}
            rx={1}
            fill={over ? 'var(--accent-red)' : 'var(--streamer-text)'}
            opacity={0.85}
          />
        )
      })}
      <line x1={0} y1={budgetY} x2={WIDTH} y2={budgetY} stroke="var(--accent-green)" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
