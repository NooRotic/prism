import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrismLinkBar from '../PrismLinkBar'
import { useApp } from '../../../contexts/AppContext'
import { moreFromChannel } from '../../../lib/channelLatestApi'
import { saveLink } from '../../../lib/linkedAccounts'
import type { TwitchVideo } from '../../../types/twitch'

vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../../lib/channelLatestApi', () => ({ moreFromChannel: vi.fn() }))
vi.mock('../../../lib/videoStats', () => ({ withStats: vi.fn(async (v: unknown[]) => v) }))

const CHANNEL = 'UCX6OQ3DkcsbYNE6H8uQQuVA'
const dispatch = vi.fn()

const tv = (id: string, title: string, created: string, views = 10): TwitchVideo => ({
  id, stream_id: 's', user_id: 'u', user_login: 'mrbeast', user_name: 'MrBeast', title, description: '',
  created_at: created, published_at: created, url: `https://www.twitch.tv/videos/${id}`, thumbnail_url: '', viewable: 'public',
  view_count: views, language: 'en', type: 'archive', duration: '1h0m0s',
})
const yv = (id: string, title: string, publishedAt: string, viewCount = '5') => ({ id, title, channelTitle: 'MrBeast', thumbnail: '', publishedAt, viewCount, description: '' })

function setup(opts: { confirmed?: boolean; link?: boolean; twitch?: TwitchVideo[] } = {}) {
  const { confirmed = true, link = true, twitch = [tv('111', 'twitch newest', '2026-11-20T00:00:00Z'), tv('222', 'twitch oldest', '2026-01-01T00:00:00Z')] } = opts
  if (link) saveLink({ twitch: 'mrbeast', youtube: { channelId: CHANNEL, title: 'Mr Beast', handle: '@MrBeast' }, confirmed, linkedAt: 1 })
  vi.mocked(useApp).mockReturnValue({ state: { channel: { videos: twitch } }, dispatch } as never)
  return render(
    <MemoryRouter>
      <PrismLinkBar login="MrBeast" />
    </MemoryRouter>,
  )
}
const bar = () => screen.getByRole('button', { name: /Twitch \+ YouTube videos/ })
const titles = () => screen.getAllByTestId('combined-title').map((e) => e.textContent)

beforeEach(() => {
  localStorage.clear()
  dispatch.mockReset()
  vi.mocked(moreFromChannel).mockReset()
  vi.mocked(moreFromChannel).mockResolvedValue({ status: 'ok', videos: [yv('aaaaaaaaaaa', 'youtube mid', '2026-06-01T00:00:00Z')], nextPageToken: null })
})

describe('PrismLinkBar', () => {
  it('shows nothing for a channel with no link, or a link with no YouTube channel', () => {
    setup({ link: false })
    expect(screen.queryByTestId('prism-bar')).not.toBeInTheDocument()
  })

  it('is a rainbow bar for a confirmed link, and a plain one for a link the viewer made', () => {
    const { unmount } = setup({ confirmed: true })
    expect(screen.getByTestId('prism-bar')).toHaveAttribute('data-confirmed', 'true')
    unmount()
    localStorage.clear()
    setup({ confirmed: false })
    expect(screen.getByTestId('prism-bar')).toHaveAttribute('data-confirmed', 'false')
  })

  it('animates the spectrum only on a confirmed link, so it stands out from a plain one', () => {
    const { unmount } = setup({ confirmed: true })
    expect(screen.getByTestId('prism-spectrum')).toHaveClass('prism-spectrum')
    // The home icon's line-art prism (beam in, rays out), with no text, on a confirmed link only.
    const badge = screen.getByTestId('prism-badge')
    expect(badge.querySelector('[data-prism-mark="icon"]')).not.toBeNull()
    expect(badge.textContent).toBe('')
    // The bar's own background carries a faint moving spectrum too, not just its border.
    expect(bar()).toHaveClass('prism-tint')
    unmount()
    localStorage.clear()
    setup({ confirmed: false })
    expect(screen.getByTestId('prism-spectrum')).not.toHaveClass('prism-spectrum')
    expect(bar()).not.toHaveClass('prism-tint')
    expect(screen.queryByTestId('prism-badge')).not.toBeInTheDocument()
  })

  it('lays the cards out in columns about 1.75 times narrower than the old three-up grid (so the thumbnails are too)', async () => {
    setup()
    fireEvent.click(bar())
    await screen.findByText('youtube mid')
    // minmax(17.5rem, 1fr): 280px cards, where the old grid gave about 490px on a wide page.
    expect(screen.getByTestId('combined-grid').className).toContain('minmax(17.5rem,1fr)')
  })

  it('stays closed and spends nothing until it is clicked', () => {
    setup()
    expect(bar()).toHaveAttribute('aria-expanded', 'false')
    expect(moreFromChannel).not.toHaveBeenCalled()
    expect(screen.queryByTestId('combined-title')).not.toBeInTheDocument()
  })

  it('opens to one list of both platforms, newest first, and closes again', async () => {
    setup()
    fireEvent.click(bar())
    await screen.findByText('youtube mid')
    expect(bar()).toHaveAttribute('aria-expanded', 'true')
    expect(moreFromChannel).toHaveBeenCalledWith('UU' + CHANNEL.slice(2))
    expect(titles()).toEqual(['twitch newest', 'youtube mid', 'twitch oldest'])
    expect(screen.getByTestId('combined-count')).toHaveTextContent('2 Twitch + 1 YouTube')
    fireEvent.click(bar())
    expect(screen.queryByTestId('combined-title')).not.toBeInTheDocument()
  })

  it('filters by platform and sorts', async () => {
    setup()
    fireEvent.click(bar())
    await screen.findByText('youtube mid')
    fireEvent.click(screen.getByRole('button', { name: 'YouTube only' }))
    expect(titles()).toEqual(['youtube mid'])
    fireEvent.click(screen.getByRole('button', { name: 'Twitch only' }))
    expect(titles()).toEqual(['twitch newest', 'twitch oldest'])
    fireEvent.click(screen.getByRole('button', { name: 'Both' }))
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    expect(titles()).toEqual(['twitch oldest', 'youtube mid', 'twitch newest'])
  })

  it('plays a Twitch VOD in the page player, and sends a YouTube video to its own page', async () => {
    setup()
    fireEvent.click(bar())
    await screen.findByText('youtube mid')
    expect(screen.getByRole('link', { name: /youtube mid/ })).toHaveAttribute('href', '/youtube/aaaaaaaaaaa')
    fireEvent.click(screen.getByRole('button', { name: /twitch newest/ }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PLAY_URL', url: 'https://www.twitch.tv/videos/111' }))
  })

  it('tags a video that is probably the same stream on the other platform', async () => {
    vi.mocked(moreFromChannel).mockResolvedValue({ status: 'ok', videos: [yv('bbbbbbbbbbb', 'twitch newest (full stream)', '2026-11-20T05:00:00Z')], nextPageToken: null })
    setup()
    fireEvent.click(bar())
    await screen.findByText('twitch newest (full stream)')
    expect(screen.getAllByText(/Also on/).map((e) => e.textContent)).toEqual(expect.arrayContaining(['Also on YouTube', 'Also on Twitch']))
    expect(titles()).toHaveLength(3)
  })

  it('loads more YouTube videos on request', async () => {
    vi.mocked(moreFromChannel)
      .mockResolvedValueOnce({ status: 'ok', videos: [yv('aaaaaaaaaaa', 'youtube mid', '2026-06-01T00:00:00Z')], nextPageToken: 'P2' })
      .mockResolvedValueOnce({ status: 'ok', videos: [yv('bbbbbbbbbbb', 'youtube second page', '2026-05-01T00:00:00Z')], nextPageToken: null })
    setup()
    fireEvent.click(bar())
    await screen.findByText('youtube mid')
    fireEvent.click(screen.getByRole('button', { name: /Load more YouTube/ }))
    await screen.findByText('youtube second page')
    expect(moreFromChannel).toHaveBeenLastCalledWith('UU' + CHANNEL.slice(2), 'P2')
    expect(screen.queryByRole('button', { name: /Load more YouTube/ })).not.toBeInTheDocument()
  })

  it('still shows the Twitch VODs and says so when YouTube cannot be read', async () => {
    vi.mocked(moreFromChannel).mockResolvedValue({ status: 'error' })
    setup()
    fireEvent.click(bar())
    expect(await screen.findByText(/Could not reach YouTube/i)).toBeInTheDocument()
    expect(titles()).toEqual(['twitch newest', 'twitch oldest'])
  })

  it('does not read YouTube again when the list is closed and reopened', async () => {
    setup()
    fireEvent.click(bar())
    await screen.findByText('youtube mid')
    fireEvent.click(bar())
    fireEvent.click(bar())
    await waitFor(() => expect(within(screen.getByTestId('prism-bar')).getAllByTestId('combined-title').length).toBeGreaterThan(0))
    expect(moreFromChannel).toHaveBeenCalledTimes(1)
  })
})
