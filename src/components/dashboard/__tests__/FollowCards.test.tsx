import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FollowCards from '../FollowCards'
import type { EnrichedFollow } from '../../../lib/followsStore'

const NOW = Date.parse('2026-11-11T12:00:00Z')
const MIN = 60_000

function live(name: string, minutesAgo: number, viewerCount: number): EnrichedFollow {
  return {
    broadcaster_id: name.toLowerCase(),
    broadcaster_login: name.toLowerCase(),
    broadcaster_name: name,
    followed_at: '2022-01-01T00:00:00Z',
    isLive: true,
    viewerCount,
    startedAt: new Date(NOW - minutesAgo * MIN).toISOString(),
  }
}

function renderCards(recent: EnrichedFollow[], top: EnrichedFollow[]) {
  return render(
    <MemoryRouter>
      <FollowCards recent={recent} top={top} now={NOW} />
    </MemoryRouter>,
  )
}

describe('FollowCards', () => {
  it('lists who just went live with their uptimes', () => {
    renderCards([live('PixelFox', 4, 1200), live('NightOwl', 22, 310), live('Mossy', 65, 88)], [])

    expect(screen.getByRole('heading', { name: 'Just went live' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /PixelFox/ })).toHaveTextContent('4m')
    expect(screen.getByRole('link', { name: /NightOwl/ })).toHaveTextContent('22m')
    expect(screen.getByRole('link', { name: /Mossy/ })).toHaveTextContent('1h 05m')
  })

  it('lists the most watched with compact viewer counts', () => {
    renderCards([], [live('Kestrel', 160, 2400), live('Ragnarok', 318, 1900)])

    expect(screen.getByRole('heading', { name: 'Most watched' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Kestrel/ })).toHaveTextContent('2.4k')
    expect(screen.getByRole('link', { name: /Ragnarok/ })).toHaveTextContent('1.9k')
  })

  it('links each name to its channel page', () => {
    renderCards([live('PixelFox', 4, 1200)], [live('Kestrel', 160, 2400)])

    expect(screen.getByRole('link', { name: /PixelFox/ })).toHaveAttribute('href', '/twitch/pixelfox')
    expect(screen.getByRole('link', { name: /Kestrel/ })).toHaveAttribute('href', '/twitch/kestrel')
  })

  it('leaves out a card whose list is empty', () => {
    renderCards([], [live('Kestrel', 160, 2400)])

    expect(screen.queryByRole('heading', { name: 'Just went live' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Most watched' })).toBeInTheDocument()
  })
})
