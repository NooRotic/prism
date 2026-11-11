import { render, screen } from '@testing-library/react'
import BarChart from '../BarChart'
import type { DayBucket } from '../../../lib/historyStats'

function buckets(values: (number | null)[]): DayBucket[] {
  return values.map((value, i) => ({
    day: `2026-11-${String(i + 1).padStart(2, '0')}`,
    at: new Date(2026, 10, i + 1).getTime(),
    value,
  }))
}

function rects(container: HTMLElement) {
  return [...container.querySelectorAll('rect')]
}

describe('BarChart', () => {
  it('is one image with the label it is given', () => {
    render(<BarChart buckets={buckets([1, 2])} ariaLabel="Followers gained per day, last 30 days, total 3" />)

    expect(screen.getByRole('img', { name: 'Followers gained per day, last 30 days, total 3' })).toBeInTheDocument()
  })

  it('draws no bar for a day that is not known', () => {
    const { container } = render(<BarChart buckets={buckets([null, 3, null, 0])} ariaLabel="x" />)

    expect(rects(container)).toHaveLength(2)
  })

  it('draws a grey stub for a day with zero and a bar for a day with a value', () => {
    const { container } = render(<BarChart buckets={buckets([0, 4])} ariaLabel="x" />)

    const [zero, bar] = rects(container)
    expect(zero).toHaveAttribute('data-kind', 'zero')
    expect(Number(zero.getAttribute('height'))).toBe(2)
    expect(bar).toHaveAttribute('data-kind', 'bar')
    expect(Number(bar.getAttribute('height'))).toBeGreaterThan(2)
  })

  it('scales the bars to the tallest one', () => {
    const { container } = render(<BarChart buckets={buckets([1, 2, 4])} ariaLabel="x" />)

    expect(rects(container).map((r) => Number(r.getAttribute('height')))).toEqual([19, 38, 76])
  })

  it('keeps each day in its own slot, so a missing day leaves a gap instead of shifting the rest', () => {
    const { container } = render(<BarChart buckets={buckets([null, 3])} ariaLabel="x" />)

    const [bar] = rects(container)
    expect(Number(bar.getAttribute('x'))).toBeGreaterThanOrEqual(10)
  })

  it('draws nothing but the baseline when no day is known', () => {
    const { container } = render(<BarChart buckets={buckets([null, null])} ariaLabel="x" />)

    expect(rects(container)).toHaveLength(0)
    expect(screen.getByRole('img', { name: 'x' })).toBeInTheDocument()
  })

  it('never writes NaN into the drawing', () => {
    const { container } = render(<BarChart buckets={buckets([0, 0, Number.NaN])} ariaLabel="x" />)

    expect(container.innerHTML).not.toContain('NaN')
  })
})
