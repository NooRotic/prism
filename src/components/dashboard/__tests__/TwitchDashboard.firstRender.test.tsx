import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import TwitchDashboard from '../TwitchDashboard'
import { useApp } from '../../../contexts/AppContext'
import type { TwitchUser } from '../../../types/twitch'

// This file uses the real follows hook and store. Rendering to a string runs no effects,
// so it shows exactly what the very first commit would paint, before anything subscribes.
vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../../hooks/useSessionExpiry', () => ({ useSessionExpiry: () => vi.fn() }))
vi.mock('../useChatColor', () => ({ useChatColor: () => null }))

const me: TwitchUser = {
  id: 'first-render-user',
  login: 'yourname',
  display_name: 'YourName',
  type: '',
  broadcaster_type: '',
  description: '',
  profile_image_url: '',
  offline_image_url: '',
  view_count: 0,
  created_at: '2016-03-04T00:00:00Z',
}

describe('TwitchDashboard first render', () => {
  it('paints the skeleton, not "you follow no one", before the follows have started loading', () => {
    vi.mocked(useApp).mockReturnValue({
      state: { auth: { user: me, profileError: false, expired: false, isAuthenticated: true, token: 't' } },
      dispatch: vi.fn(),
    } as unknown as ReturnType<typeof useApp>)

    const html = renderToString(
      <MemoryRouter>
        <TwitchDashboard />
      </MemoryRouter>,
    )

    expect(html).toContain('Loading your dashboard')
    expect(html).not.toContain('follow anyone')
  })
})
