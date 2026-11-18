import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CatchupVideo } from '../../lib/catchup'
import { useCatchup, type CatchupState } from '../../hooks/useCatchup'
import { isGoogleAuthConfigured } from '../../lib/googleYoutubeAuth'
import YoutubeCatchupPage from '../YoutubeCatchupPage'

vi.mock('../../hooks/useCatchup', () => ({ useCatchup: vi.fn() }))
vi.mock('../../lib/googleYoutubeAuth', () => ({ isGoogleAuthConfigured: vi.fn(() => true) }))

const vid = (id: string, tag: 'S' | 'W' | 'R'): CatchupVideo => ({
  id,
  title: `title ${id}`,
  channel: 'chan',
  publishedAt: '',
  durationSec: 125,
  thumbnail: `https://img/${id}.jpg`,
  tag,
})

const state = (over: Partial<CatchupState> = {}): CatchupState => ({
  queue: [vid('aaaaaaaaaaa', 'S'), vid('bbbbbbbbbbb', 'W'), vid('ccccccccccc', 'R')],
  status: 'ready',
  notices: [],
  subscriptionCount: 12,
  watchLaterCount: 3,
  importSubscriptions: vi.fn(async () => {}),
  savePastedWatchLater: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
  ...over,
})

function renderPage(s: CatchupState) {
  vi.mocked(useCatchup).mockReturnValue(s)
  return render(
    <MemoryRouter>
      <YoutubeCatchupPage />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.mocked(isGoogleAuthConfigured).mockReturnValue(true))

describe('YoutubeCatchupPage', () => {
  it('shows each video as a card linking to its player page, with a lane chip', () => {
    renderPage(state())
    const link = screen.getByRole('link', { name: /title aaaaaaaaaaa/ })
    expect(link).toHaveAttribute('href', '/youtube/aaaaaaaaaaa')
    expect(within(link).getByText('S')).toBeInTheDocument()
    expect(within(link).getByText('2:05')).toBeInTheDocument()
  })

  it('filters the grid to one lane', () => {
    renderPage(state())
    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    expect(screen.getByRole('link', { name: /title aaaaaaaaaaa/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /title bbbbbbbbbbb/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('link', { name: /title bbbbbbbbbbb/ })).toBeInTheDocument()
  })

  it('shows notices and the counts', () => {
    renderPage(state({ notices: ['Related: no suggestions came back for your recent videos.'] }))
    expect(screen.getByText(/no suggestions came back/)).toBeInTheDocument()
    expect(screen.getByText(/12 subscriptions/)).toBeInTheDocument()
    expect(screen.getByText(/3 Watch Later/)).toBeInTheDocument()
  })

  it('shows an empty state when there is nothing to watch', () => {
    renderPage(state({ queue: [], subscriptionCount: 0, watchLaterCount: 0 }))
    expect(screen.getByText(/Nothing to show yet/)).toBeInTheDocument()
  })

  it('disables the import button and says why when no Google client id is set', () => {
    vi.mocked(isGoogleAuthConfigured).mockReturnValue(false)
    renderPage(state())
    expect(screen.getByRole('button', { name: /Import my subscriptions/ })).toBeDisabled()
    expect(screen.getByText(/VITE_YOUTUBE_CLIENT_ID/)).toBeInTheDocument()
  })

  it('imports subscriptions on request', () => {
    const s = state()
    renderPage(s)
    fireEvent.click(screen.getByRole('button', { name: /Import my subscriptions/ }))
    expect(s.importSubscriptions).toHaveBeenCalledTimes(1)
  })

  it('saves pasted Watch Later text', () => {
    const s = state()
    renderPage(s)
    fireEvent.change(screen.getByLabelText(/Watch Later videos/i), { target: { value: 'https://youtu.be/aaaaaaaaaaa' } })
    fireEvent.click(screen.getByRole('button', { name: /Save pasted videos/ }))
    expect(s.savePastedWatchLater).toHaveBeenCalledWith('https://youtu.be/aaaaaaaaaaa')
  })

  it('links out to the real Watch Later list', () => {
    renderPage(state())
    expect(screen.getByRole('link', { name: /Open Watch Later on YouTube/ })).toHaveAttribute(
      'href',
      'https://www.youtube.com/playlist?list=WL',
    )
  })
})
