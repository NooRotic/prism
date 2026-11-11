import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LiveWall from '../LiveWall'
import { STORAGE_KEYS } from '../../../config/storageKeys'
import type { EnrichedFollow } from '../../../lib/followsStore'

const NOW = Date.parse('2026-11-11T12:00:00Z')
const MIN = 60_000

function live(name: string, minutesAgo: number, overrides: Partial<EnrichedFollow> = {}): EnrichedFollow {
  return {
    broadcaster_id: name.toLowerCase(),
    broadcaster_login: name.toLowerCase(),
    broadcaster_name: name,
    followed_at: '2022-01-01T00:00:00Z',
    isLive: true,
    viewerCount: 1200,
    gameName: 'Just Chatting',
    thumbnailUrl: `https://img.test/live_${name.toLowerCase()}-{width}x{height}.jpg`,
    startedAt: new Date(NOW - minutesAgo * MIN).toISOString(),
    ...overrides,
  }
}

function many(n: number): EnrichedFollow[] {
  return Array.from({ length: n }, (_, i) => live(`Chan${i + 1}`, i + 1))
}

interface WallOverrides {
  live?: EnrichedFollow[]
  offlineCount?: number
  more?: boolean
  cap?: number
  onOpenFollowing?: () => void
}

function renderWall({
  live: follows = many(3),
  offlineCount = 0,
  more = false,
  cap = 8,
  onOpenFollowing = vi.fn(),
}: WallOverrides = {}) {
  return render(
    <MemoryRouter>
      <LiveWall
        live={follows}
        offlineCount={offlineCount}
        more={more}
        now={NOW}
        cap={cap}
        onOpenFollowing={onOpenFollowing}
      />
    </MemoryRouter>,
  )
}

const tiles = () => screen.getAllByRole('link')

describe('LiveWall', () => {
  it('opens on the Wall tab, with Wall and List as tabs', () => {
    renderWall()

    expect(screen.getByRole('tab', { name: 'Wall' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'false')
  })

  it('remembers the chosen tab', () => {
    const first = renderWall()
    fireEvent.click(screen.getByRole('tab', { name: 'List' }))

    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_DASHBOARD_WALL_VIEW)).toBe('list')

    first.unmount()
    renderWall()

    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true')
  })

  it('falls back to the Wall tab when the stored value is not a known view', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_DASHBOARD_WALL_VIEW, 'sideways')
    renderWall()

    expect(screen.getByRole('tab', { name: 'Wall' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows a tile that links to the channel page with its viewers, name, category and uptime', () => {
    renderWall({ live: [live('PixelFox', 4, { viewerCount: 1200 })] })

    const tile = screen.getByRole('link', { name: /PixelFox, Just Chatting, 1\.2k viewers/ })
    expect(tile).toHaveAttribute('href', '/twitch/pixelfox')
    expect(tile).toHaveTextContent('1.2k')
    expect(tile).toHaveTextContent('PixelFox')
    expect(tile).toHaveTextContent('Just Chatting')
    expect(tile).toHaveTextContent('4m')
  })

  it('fills in the thumbnail size placeholders', () => {
    const { container } = renderWall({ live: [live('PixelFox', 4)] })

    const src = container.querySelector('img')?.getAttribute('src') ?? ''
    expect(src).toContain('320x180')
    expect(src).not.toContain('{width}')
  })

  it('shows only the first cap tiles, with a button for the rest that expands in place', () => {
    renderWall({ live: many(12), cap: 8 })

    expect(tiles()).toHaveLength(8)

    fireEvent.click(screen.getByRole('button', { name: '+ 4 more live' }))
    expect(tiles()).toHaveLength(12)

    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(tiles()).toHaveLength(8)
  })

  it('has no expander when everyone fits', () => {
    renderWall({ live: many(8), cap: 8 })

    expect(screen.queryByRole('button', { name: /more live|Show fewer/ })).not.toBeInTheDocument()
  })

  it('ends with the offline count, as a floor while more follows are still to load', () => {
    const onOpenFollowing = vi.fn()
    const first = renderWall({ offlineCount: 42, onOpenFollowing })

    fireEvent.click(screen.getByRole('button', { name: /^42 offline/ }))
    expect(onOpenFollowing).toHaveBeenCalledTimes(1)

    first.unmount()
    renderWall({ offlineCount: 42, more: true })
    expect(screen.getByRole('button', { name: /^42\+ offline/ })).toBeInTheDocument()
  })

  it('shows name, category, viewers and uptime for each row in the List view', () => {
    renderWall({ live: [live('Kestrel', 160, { viewerCount: 2400, gameName: 'Elden Ring' })] })
    fireEvent.click(screen.getByRole('tab', { name: 'List' }))

    const row = screen.getByRole('link', { name: /Kestrel/ })
    expect(row).toHaveAttribute('href', '/twitch/kestrel')
    expect(row).toHaveTextContent('Elden Ring')
    expect(row).toHaveTextContent('2.4k')
    expect(row).toHaveTextContent('2h 40m')
  })
})
