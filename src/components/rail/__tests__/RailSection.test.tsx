import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RailSection from '../RailSection'
import type { RailEntry } from '../types'

function entries(n: number): RailEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `twitch:${i}`,
    displayName: `Chan${i}`,
    avatarUrl: '',
    href: `/twitch/chan${i}`,
    isLive: true,
    viewerCount: 100 - i,
    streamTitle: null,
    gameName: null,
    startedAt: null,
  }))
}

function renderSection(props: Partial<React.ComponentProps<typeof RailSection>> = {}) {
  return render(
    <MemoryRouter>
      <RailSection
        label="Following"
        icon={<span data-testid="section-icon" />}
        entries={entries(3)}
        expanded
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('RailSection', () => {
  it('renders one card per entry', () => {
    renderSection({ entries: entries(3) })
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('is labelled for assistive tech', () => {
    renderSection()
    expect(screen.getByRole('region', { name: 'Following' })).toBeInTheDocument()
  })

  it('renders its icon', () => {
    renderSection()
    expect(screen.getByTestId('section-icon')).toBeInTheDocument()
  })

  it('shows the label text only when expanded', () => {
    const { rerender } = renderSection({ expanded: false })
    expect(screen.queryByText('Following')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <RailSection
          label="Following"
          icon={<span data-testid="section-icon" />}
          entries={entries(3)}
          expanded
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Following')).toBeInTheDocument()
  })

  it('renders nothing at all when it has no entries', () => {
    const { container } = renderSection({ entries: [] })
    expect(container).toBeEmptyDOMElement()
  })

  // A cap and a "+N" control used to hide the rest. The rail now lists everyone live and
  // scrolls, so a section shows every entry it is given.
  it('shows every entry it is given, however many', () => {
    renderSection({ entries: entries(40) })
    expect(screen.getAllByRole('link')).toHaveLength(40)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
