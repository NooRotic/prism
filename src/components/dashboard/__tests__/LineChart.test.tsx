import { render, screen } from '@testing-library/react'
import LineChart from '../LineChart'

const FROM = new Date(2026, 9, 13).getTime()
const TO = new Date(2026, 10, 11).getTime()
const DAY = 24 * 60 * 60 * 1000

describe('LineChart', () => {
  it('is one image with the label it is given', () => {
    render(<LineChart points={[]} from={FROM} to={TO} ariaLabel="Views per broadcast, last 30 days, 0 broadcasts" />)

    expect(screen.getByRole('img', { name: 'Views per broadcast, last 30 days, 0 broadcasts' })).toBeInTheDocument()
  })

  it('draws a line and one dot per broadcast', () => {
    const points = [
      { at: FROM + 2 * DAY, value: 10 },
      { at: FROM + 9 * DAY, value: 30 },
      { at: FROM + 20 * DAY, value: 20 },
    ]
    const { container } = render(<LineChart points={points} from={FROM} to={TO} ariaLabel="x" />)

    expect(container.querySelectorAll('circle')).toHaveLength(3)
    const line = container.querySelector('polyline')
    expect(line?.getAttribute('points')?.split(' ')).toHaveLength(3)
  })

  it('draws a lone broadcast as a dot', () => {
    const { container } = render(<LineChart points={[{ at: FROM + 5 * DAY, value: 12 }]} from={FROM} to={TO} ariaLabel="x" />)

    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })

  it('draws no line and no dots for no broadcasts', () => {
    const { container } = render(<LineChart points={[]} from={FROM} to={TO} ariaLabel="x" />)

    expect(container.querySelector('polyline')).toBeNull()
    expect(container.querySelectorAll('circle')).toHaveLength(0)
  })

  it('never writes NaN into the drawing', () => {
    const { container } = render(
      <LineChart points={[{ at: FROM, value: 0 }, { at: FROM, value: 0 }]} from={FROM} to={FROM} ariaLabel="x" />,
    )

    expect(container.innerHTML).not.toContain('NaN')
  })
})
