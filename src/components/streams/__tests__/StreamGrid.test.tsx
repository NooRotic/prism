import { fireEvent, render, screen } from '@testing-library/react'
import StreamGrid from '../StreamGrid'
import type { StreamEntry } from '../../../lib/streamsApi'

function makeStreams(count: number): StreamEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id${i}`,
    name: `Stream ${i}`,
    groups: [0],
    country: null,
    logo: null,
    kind: 'hls' as const,
    pinned: false,
    state: 'working' as const,
    url: 'https://x.test/a.m3u8',
  }))
}

/** jsdom has no layout: give the scrolling box a size, as the browser would. */
function stubSize(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height)
}

const card = (stream: StreamEntry, selected: boolean) => (
  <button type="button" data-testid="card" aria-current={selected ? 'true' : undefined}>
    {stream.name}
  </button>
)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StreamGrid', () => {
  it('mounts only the cards in view, however long the list is', () => {
    stubSize(900, 600)

    render(<StreamGrid streams={makeStreams(5000)} selectedId={null} onSelect={() => {}} renderCard={card} />)

    const mounted = screen.getAllByTestId('card').length
    expect(mounted).toBeGreaterThan(0)
    expect(mounted).toBeLessThan(100)
    expect(screen.getByText('Stream 0')).toBeInTheDocument()
    expect(screen.queryByText('Stream 4999')).toBeNull()
  })

  it('lays the cards out in as many columns as fit', () => {
    stubSize(900, 600)

    render(<StreamGrid streams={makeStreams(40)} selectedId={null} onSelect={() => {}} renderCard={card} minCardWidth={200} />)

    const grid = screen.getByRole('list')
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))')
  })

  it('moves the window when the box is scrolled', () => {
    stubSize(900, 600)
    render(<StreamGrid streams={makeStreams(5000)} selectedId={null} onSelect={() => {}} renderCard={card} />)
    const box = screen.getByRole('region', { name: /stream list/i })

    box.scrollTop = 40_000
    fireEvent.scroll(box)

    expect(screen.queryByText('Stream 0')).toBeNull()
    const names = screen.getAllByTestId('card').map((el) => el.textContent ?? '')
    const numbers = names.map((n) => Number(n.replace('Stream ', '')))
    expect(Math.min(...numbers)).toBeGreaterThan(100)
    expect(screen.getAllByTestId('card').length).toBeLessThan(100)
  })

  it('keeps the scrollbar the size of the whole list', () => {
    stubSize(900, 600)

    const { container } = render(
      <StreamGrid streams={makeStreams(1000)} selectedId={null} onSelect={() => {}} renderCard={card} minCardWidth={300} rowHeight={80} />,
    )

    // 900 / 300 = 3 columns, 334 rows of 80 pixels.
    const spacer = container.querySelector('[data-grid-spacer]') as HTMLElement
    expect(spacer.style.height).toBe(`${334 * 80}px`)
  })

  it('tells the card which one is selected', () => {
    stubSize(900, 600)

    render(<StreamGrid streams={makeStreams(10)} selectedId="id3" onSelect={() => {}} renderCard={card} />)

    const marked = screen.getAllByTestId('card').filter((el) => el.getAttribute('aria-current') === 'true')
    expect(marked.map((el) => el.textContent)).toEqual(['Stream 3'])
  })

  it('passes a chosen id up when the card does', () => {
    stubSize(900, 600)
    const onSelect = vi.fn()

    render(
      <StreamGrid
        streams={makeStreams(10)}
        selectedId={null}
        onSelect={onSelect}
        renderCard={(stream) => (
          <button type="button" data-testid="card" onClick={() => onSelect(stream.id)}>
            {stream.name}
          </button>
        )}
      />,
    )
    fireEvent.click(screen.getByText('Stream 2'))

    expect(onSelect).toHaveBeenCalledWith('id2')
  })

  it('says so when no stream matches', () => {
    stubSize(900, 600)

    render(<StreamGrid streams={[]} selectedId={null} onSelect={() => {}} renderCard={card} />)

    expect(screen.getByText('No streams match.')).toBeInTheDocument()
    expect(screen.queryAllByTestId('card')).toHaveLength(0)
  })

  it('still draws the first screenful before the box has been measured', () => {
    stubSize(0, 0)

    render(<StreamGrid streams={makeStreams(500)} selectedId={null} onSelect={() => {}} renderCard={card} />)

    expect(screen.getAllByTestId('card').length).toBeGreaterThan(0)
  })

  it('goes back to the top when the list it shows changes', () => {
    stubSize(900, 600)
    const { rerender } = render(<StreamGrid streams={makeStreams(5000)} selectedId={null} onSelect={() => {}} renderCard={card} />)
    const box = screen.getByRole('region', { name: /stream list/i })
    box.scrollTop = 40_000
    fireEvent.scroll(box)

    rerender(<StreamGrid streams={makeStreams(300)} selectedId={null} onSelect={() => {}} renderCard={card} />)

    expect(box.scrollTop).toBe(0)
    expect(screen.getByText('Stream 0')).toBeInTheDocument()
  })
})
