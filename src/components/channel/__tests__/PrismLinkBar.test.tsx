import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrismLinkBar from '../PrismLinkBar'
import { trackEvent } from '../../../lib/analytics'
import { useApp } from '../../../contexts/AppContext'
import { moreFromChannel } from '../../../lib/channelLatestApi'
import { saveLink } from '../../../lib/linkedAccounts'
import type { TwitchVideo } from '../../../types/twitch'

vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../../lib/channelLatestApi', () => ({ moreFromChannel: vi.fn() }))
vi.mock('../../../lib/analytics', async (original) => ({ ...(await original<typeof import('../../../lib/analytics')>()), trackEvent: vi.fn() }))
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
    // The prism mark is on every linked channel; only the moving spectrum and wash are for a confirmed one.
    expect(screen.getByTestId('prism-badge').querySelector('[data-prism-mark="icon"]')).not.toBeNull()
    expect(screen.getByTestId('prism-badge')).toHaveStyle({ opacity: '0.6' })
  })

  it('lays the cards out in columns about 1.75 times narrower than the old three-up grid (so the thumbnails are too)', async () => {
    setup()
    fireEvent.click(bar())
    await screen.findByText('youtube mid')
    // minmax(min(11rem, 45%), 1fr): 176px cards, and never wider than 45% of the row so a phone still gets two columns
    // (a plain 11rem minimum gave one 343px column at 375px wide).
    expect(screen.getByTestId('combined-grid').className).toContain('minmax(min(11rem,45%),1fr)')
  })

  it('gives a link the viewer made the same spectrum outline as the Edit links button (still until hovered)', () => {
    setup({ confirmed: false })
    const outline = screen.getByTestId('prism-spectrum')
    expect(outline).toHaveClass('prism-pill')
    // Only a confirmed link gets the moving spectrum and glow.
    expect(outline).not.toHaveClass('prism-spectrum')
  })

  it('colours the words Twitch and YouTube in the title with their platforms, readable on the dark card', () => {
    setup()
    expect(screen.getByText('Twitch')).toHaveStyle({ color: 'var(--accent-twitch-text)' })
    expect(screen.getByText('YouTube')).toHaveStyle({ color: 'var(--accent-youtube-text)' })
  })

  it('shows "linked by you" and the channel name with strong contrast, the name bolder, and never cuts the name off', () => {
    setup({ confirmed: false })
    // On a phone the line wraps instead of truncating, so the channel name is always readable.
    expect(screen.getByText('Mr Beast').parentElement).not.toHaveClass('truncate')
    expect(screen.getByText('linked by you')).toHaveStyle({ color: 'var(--text-secondary)' })
    expect(screen.getByText('Mr Beast')).toHaveStyle({ color: 'var(--text-primary)' })
  })

  it('tints the Twitch only and YouTube only buttons with their platform, solid when chosen; Both stays neutral', async () => {
    setup()
    fireEvent.click(bar())
    await screen.findByText('youtube mid')
    const twitch = screen.getByRole('button', { name: 'Twitch only' })
    const youtube = screen.getByRole('button', { name: 'YouTube only' })
    // Not chosen: a faint tint of the platform, its colour as the text and a thin outline.
    expect(twitch).toHaveStyle({ color: 'var(--accent-twitch-text)' })
    expect(twitch.getAttribute('style')).toContain('1px solid var(--accent-twitch)')
    expect(youtube).toHaveStyle({ color: 'var(--accent-youtube-text)' })
    expect(youtube.getAttribute('style')).toContain('1px solid var(--accent-youtube)')
    expect(twitch.getAttribute('style')).toContain('rgba(145, 70, 255')
    expect(youtube.getAttribute('style')).toContain('rgba(255, 0, 0')
    expect(screen.getByRole('button', { name: 'Both' }).getAttribute('style')).not.toMatch(/rgba\((145|255)/)
    // Chosen: the platform colour, solid, with white text.
    fireEvent.click(twitch)
    expect(twitch).toHaveStyle({ backgroundColor: 'var(--accent-twitch)', color: '#fff' })
    fireEvent.click(youtube)
    expect(youtube).toHaveStyle({ backgroundColor: 'var(--accent-youtube)', color: '#fff' })
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

  it('outlines each card with a thin line in its platform colour (purple Twitch, red YouTube)', async () => {
    setup()
    fireEvent.click(bar())
    await screen.findByText('youtube mid')
    const youtubeCard = screen.getByRole('link', { name: /youtube mid/ })
    const twitchCard = screen.getByRole('button', { name: /twitch newest/ })
    expect(youtubeCard.getAttribute('style')).toMatch(/1px solid[^;]*accent-youtube/)
    expect(twitchCard.getAttribute('style')).toMatch(/1px solid[^;]*accent-twitch/)
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

describe('PrismLinkBar: what is counted', () => {
  it('opening the bar, each time, and not closing it', async () => {
    vi.mocked(trackEvent).mockClear()
    setup()
    expect(trackEvent).not.toHaveBeenCalled()

    fireEvent.click(bar())
    await waitFor(() => expect(screen.getByTestId('combined-grid')).toBeInTheDocument())
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['Linking', 'videos together', 'twitch/mrbeast <-> youtube/Mr Beast']])

    fireEvent.click(bar())
    expect(trackEvent).toHaveBeenCalledTimes(1)
    fireEvent.click(bar())
    expect(trackEvent).toHaveBeenCalledTimes(2)
  })
})
