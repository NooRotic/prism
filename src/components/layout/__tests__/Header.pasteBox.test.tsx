import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../../../contexts/AppContext'
import { Header } from '../Header'

vi.mock('../../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: vi.fn(() => ({
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    token: null,
    handleAuthError: vi.fn(),
  })),
}))

vi.mock('../../search/SmartUrlInput', () => ({
  SmartUrlInput: () => <div data-testid="smart-url-input" />,
}))

function renderHeaderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <Header />
      </AppProvider>
    </MemoryRouter>,
  )
}

// The header carries the paste box everywhere the page itself has none: the hub and the Twitch and YouTube listings
// have their own (the hub's hero, the listing pages' sidebar). The HLS / DASH page used to be a listing with a sidebar;
// it is a player page now, with no sidebar, so the header box is the only way to paste a stream address there.
describe('Header: where the paste box is', () => {
  it.each([['/hls-dash'], ['/hls-dash/'], ['/hls-dash/0123456789ab'], ['/hls-dash/custom'], ['/twitch/streamer'], ['/youtube/abc']])(
    'shows it on %s',
    (path) => {
      renderHeaderAt(path)

      expect(screen.getByTestId('smart-url-input')).toBeInTheDocument()
    },
  )

  it.each([['/'], ['/twitch'], ['/youtube']])('leaves it to the page itself on %s', (path) => {
    renderHeaderAt(path)

    expect(screen.queryByTestId('smart-url-input')).not.toBeInTheDocument()
  })
})
