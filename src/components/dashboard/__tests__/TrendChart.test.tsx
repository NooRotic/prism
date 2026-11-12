import { render, screen } from '@testing-library/react'
import TrendChart from '../TrendChart'

const DAY = 24 * 60 * 60 * 1000
const FROM = Date.UTC(2026, 10, 1)
const TO = FROM + 4 * DAY

const points = (values: (number | null)[]) => values.map((value, i) => ({ at: FROM + i * DAY, value }))

function coordinates(polyline: Element): { x: number; y: number }[] {
  return (polyline.getAttribute('points') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return { x, y }
    })
}

describe('TrendChart', () => {
  it('is one image with the label it is given', () => {
    render(<TrendChart series={[{ points: points([1, 2, 3]) }]} from={FROM} to={TO} ariaLabel="Total followers, 3 days" />)

    expect(screen.getByRole('img', { name: 'Total followers, 3 days' })).toBeInTheDocument()
  })

  it('draws one polyline for an unbroken run', () => {
    const { container } = render(<TrendChart series={[{ points: points([1, 2, 3, 4, 5]) }]} from={FROM} to={TO} ariaLabel="x" />)

    const lines = container.querySelectorAll('polyline')
    expect(lines).toHaveLength(1)
    expect(coordinates(lines[0])).toHaveLength(5)
    expect(container.querySelectorAll('circle')).toHaveLength(0)
  })

  it('draws a lone point as a dot, with no line', () => {
    const { container } = render(<TrendChart series={[{ points: points([7]) }]} from={FROM} to={TO} ariaLabel="x" />)

    expect(container.querySelectorAll('polyline')).toHaveLength(0)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })

  it('leaves two polylines when a gap splits the series', () => {
    const { container } = render(<TrendChart series={[{ points: points([1, 2, null, 3, 4]) }]} from={FROM} to={TO} ariaLabel="x" />)

    expect(container.querySelectorAll('polyline')).toHaveLength(2)
  })

  it('draws a dot for a point left alone by two gaps', () => {
    const { container } = render(<TrendChart series={[{ points: points([1, 2, null, 3, null]) }]} from={FROM} to={TO} ariaLabel="x" />)

    expect(container.querySelectorAll('polyline')).toHaveLength(1)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })

  it('draws no line and no dot when nothing is known', () => {
    const { container } = render(<TrendChart series={[{ points: points([null, null]) }]} from={FROM} to={TO} ariaLabel="x" />)

    expect(container.querySelectorAll('polyline')).toHaveLength(0)
    expect(container.querySelectorAll('circle')).toHaveLength(0)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('draws two series on one scale, the larger one above', () => {
    const { container } = render(
      <TrendChart series={[{ points: points([10, 20]) }, { points: points([30, 40]) }]} from={FROM} to={FROM + DAY} ariaLabel="x" />,
    )

    const [avg, peak] = Array.from(container.querySelectorAll('polyline')).map(coordinates)
    expect(peak[0].y).toBeLessThan(avg[1].y)
    expect(Math.min(...peak.map((p) => p.y))).toBeLessThan(Math.min(...avg.map((p) => p.y)))
  })

  it('with invert draws the smaller value higher', () => {
    const { container } = render(<TrendChart series={[{ points: points([100, 200]) }]} from={FROM} to={FROM + DAY} ariaLabel="x" invert />)

    const [line] = Array.from(container.querySelectorAll('polyline')).map(coordinates)
    expect(line[0].y).toBeLessThan(line[1].y)
  })

  it('without invert draws the larger value higher', () => {
    const { container } = render(<TrendChart series={[{ points: points([100, 200]) }]} from={FROM} to={FROM + DAY} ariaLabel="x" />)

    const [line] = Array.from(container.querySelectorAll('polyline')).map(coordinates)
    expect(line[0].y).toBeGreaterThan(line[1].y)
  })

  it('gives each series its own stroke, falling back to the defaults', () => {
    const { container } = render(
      <TrendChart series={[{ points: points([1, 2]), stroke: 'red' }, { points: points([3, 4]) }]} from={FROM} to={FROM + DAY} ariaLabel="x" />,
    )

    const lines = container.querySelectorAll('polyline')
    expect(lines[0].getAttribute('stroke')).toBe('red')
    expect(lines[1].getAttribute('stroke')).toBeTruthy()
    expect(lines[1].getAttribute('stroke')).not.toBe('red')
  })

  it('has the same drawing size as the other charts so panels keep the same height', () => {
    const { container } = render(<TrendChart series={[]} from={FROM} to={TO} ariaLabel="x" />)

    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 300 76')
  })
})
