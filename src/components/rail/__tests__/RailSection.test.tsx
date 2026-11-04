import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RailSection, { RAIL_SECTION_CAP } from '../RailSection'
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

  it('caps the visible entries at the section cap', () => {
    renderSection({ entries: entries(20) })
    expect(screen.getAllByRole('link')).toHaveLength(RAIL_SECTION_CAP)
  })

  it('shows a +N control counting everything hidden', () => {
    renderSection({ entries: entries(20), onOverflowClick: vi.fn() })
    expect(screen.getByRole('button', { name: /\+12/ })).toBeInTheDocument()
  })

  it('counts overflow from totalCount when the caller knows more than it passed', () => {
    renderSection({ entries: entries(8), totalCount: 30, onOverflowClick: vi.fn() })
    expect(screen.getByRole('button', { name: /\+22/ })).toBeInTheDocument()
  })

  it('shows no +N control when everything fits', () => {
    renderSection({ entries: entries(RAIL_SECTION_CAP) })
    expect(screen.queryByRole('button', { name: /\+/ })).not.toBeInTheDocument()
  })

  it('renders no +N control when entries overflow but no overflow handler was given', () => {
    renderSection({ entries: entries(20) })
    expect(screen.queryByRole('button', { name: /\+/ })).not.toBeInTheDocument()
  })

  it('calls onOverflowClick when the +N control is pressed', async () => {
    const onOverflowClick = vi.fn()
    const user = userEvent.setup()
    renderSection({ entries: entries(20), onOverflowClick })

    await user.click(screen.getByRole('button', { name: /\+12/ }))

    expect(onOverflowClick).toHaveBeenCalledTimes(1)
  })
})
