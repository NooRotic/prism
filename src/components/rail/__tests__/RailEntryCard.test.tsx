import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RailEntryCard from '../RailEntryCard'
import type { RailEntry } from '../types'

function entry(overrides: Partial<RailEntry> = {}): RailEntry {
  return {
    id: 'twitch:71092938',
    displayName: 'xQc',
    avatarUrl: 'https://cdn.example/xqc.png',
    href: '/twitch/xqc',
    isLive: true,
    viewerCount: 42315,
    streamTitle: 'juicer moment',
    gameName: 'Just Chatting',
    startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    ...overrides,
  }
}

function renderCard(e: RailEntry, expanded: boolean) {
  return render(
    <MemoryRouter>
      <RailEntryCard entry={e} expanded={expanded} />
    </MemoryRouter>,
  )
}

describe('RailEntryCard', () => {
  it('links to the in-app channel route', () => {
    renderCard(entry(), false)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/twitch/xqc')
  })

  it('is named for the channel even when collapsed', () => {
    renderCard(entry(), false)
    expect(screen.getByRole('link', { name: /xQc/i })).toBeInTheDocument()
  })

  it('hides the detail row when collapsed', () => {
    renderCard(entry(), false)
    expect(screen.queryByText('42,315')).not.toBeInTheDocument()
  })

  it('shows name, viewer count and uptime when expanded', () => {
    renderCard(entry(), true)
    expect(screen.getByText('xQc')).toBeInTheDocument()
    expect(screen.getByText('42,315')).toBeInTheDocument()
    expect(screen.getByText('1:00:00')).toBeInTheDocument()
  })

  it('renders a live dot when expanded', () => {
    const { container } = renderCard(entry(), true)
    expect(container.querySelector('[data-testid="rail-live-dot"]')).toBeInTheDocument()
  })

  it('renders the avatar image when a url is present', () => {
    renderCard(entry(), false)
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'https://cdn.example/xqc.png',
    )
  })

  it('falls back to an initial-letter circle when the avatar url is missing', () => {
    renderCard(entry({ avatarUrl: '' }), false)
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByText('X')).toBeInTheDocument()
  })

  it('falls back to an initial-letter circle when the image fails to load', () => {
    renderCard(entry(), false)
    const img = screen.getByRole('presentation')
    fireEvent.error(img)
    expect(screen.getByText('X')).toBeInTheDocument()
  })

  it('omits uptime when startedAt is unknown', () => {
    renderCard(entry({ startedAt: null }), true)
    expect(screen.queryByText(/^\d+:\d{2}:\d{2}$/)).not.toBeInTheDocument()
  })

  it('omits the viewer count when it is unknown', () => {
    renderCard(entry({ viewerCount: null }), true)
    expect(screen.getByText('xQc')).toBeInTheDocument()
    expect(screen.queryByText('42,315')).not.toBeInTheDocument()
  })

  it('shows the stream title when expanded', () => {
    renderCard(entry(), true)
    expect(screen.getByTestId('rail-stream-title')).toHaveTextContent(
      'juicer moment',
    )
  })

  it('hides the stream title when collapsed', () => {
    renderCard(entry(), false)
    expect(screen.queryByTestId('rail-stream-title')).not.toBeInTheDocument()
  })

  it('clamps the stream title to two lines rather than letting it run on', () => {
    renderCard(
      entry({
        streamTitle:
          'an extremely long stream title that would otherwise wrap for many lines and push every other entry off the bottom of the rail',
      }),
      true,
    )
    // jsdom does not lay text out, so the clamp cannot be observed visually.
    // Assert the declaration that produces it instead — if someone drops the
    // line-clamp, a long title silently grows the row.
    const title = screen.getByTestId('rail-stream-title')
    expect(title).toHaveStyle({ WebkitLineClamp: '2' })
    expect(title).toHaveStyle({ overflow: 'hidden' })
  })

  it('omits the title block entirely when the stream has no title', () => {
    renderCard(entry({ streamTitle: null }), true)
    expect(screen.queryByTestId('rail-stream-title')).not.toBeInTheDocument()
    expect(screen.getByText('xQc')).toBeInTheDocument()
  })

  it('rings a live avatar in Twitch purple, not the app accent green', () => {
    renderCard(entry(), false)
    const style = screen.getByRole('presentation').getAttribute('style') ?? ''
    expect(style).toContain('--accent-twitch')
    expect(style).not.toContain('--accent-green')
  })
})
