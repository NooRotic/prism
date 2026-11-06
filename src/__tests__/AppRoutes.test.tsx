import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet } from 'react-router-dom'
import AppRoutes from '../AppRoutes'

// The route table is what is under test, so the pages are replaced by markers. The not-found
// page is the real one: showing it is the point.
vi.mock('../pages/HubPage', () => ({ default: () => <div>hub page</div> }))
vi.mock('../pages/ProtocolPage', () => ({
  default: ({ protocol }: { protocol: string }) => <div>{`protocol page ${protocol}`}</div>,
}))
vi.mock('../pages/TwitchPlayerPage', () => ({ default: () => <div>twitch player page</div> }))
vi.mock('../pages/YoutubePlayerPage', () => ({ default: () => <div>youtube player page</div> }))
vi.mock('../pages/HlsDashPlayerPage', () => ({ default: () => <div>hls dash player page</div> }))
vi.mock('../pages/ChatPopoutPage', () => ({ default: () => <div>chat pop-out page</div> }))

function Layout() {
  return (
    <div data-testid="layout">
      <Outlet />
    </div>
  )
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes layout={<Layout />} />
    </MemoryRouter>,
  )

describe('AppRoutes: an address that matches nothing', () => {
  it.each([['/nope'], ['/spike-pip.html'], ['/twitch/a/b'], ['/chat']])(
    'shows the not-found page for %s, inside the layout so the header and the rail stay',
    (path) => {
      renderAt(path)

      expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
      expect(screen.getByTestId('layout')).toContainElement(
        screen.getByRole('heading', { name: 'Page not found' }),
      )
    },
  )
})

describe('AppRoutes: the pages that exist', () => {
  it.each([
    ['/', 'hub page'],
    ['/twitch', 'protocol page twitch'],
    ['/youtube', 'protocol page youtube'],
    ['/hls-dash', 'protocol page hls-dash'],
    ['/twitch/streamer', 'twitch player page'],
    ['/youtube/abc', 'youtube player page'],
    ['/hls-dash/some-stream', 'hls dash player page'],
  ])('%s still shows its page, inside the layout', (path, text) => {
    renderAt(path)

    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByTestId('layout')).toContainElement(screen.getByText(text))
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument()
  })

  it('shows the chat pop-out on its own, outside the layout', () => {
    renderAt('/chat/streamer')

    expect(screen.getByText('chat pop-out page')).toBeInTheDocument()
    expect(screen.queryByTestId('layout')).not.toBeInTheDocument()
  })
})
