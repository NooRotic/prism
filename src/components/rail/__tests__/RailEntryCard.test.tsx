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
})
