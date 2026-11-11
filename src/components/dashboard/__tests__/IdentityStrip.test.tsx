import { render, screen } from '@testing-library/react'
import IdentityStrip from '../IdentityStrip'
import { DASHBOARD_BG, contrastRatio, ensureContrast } from '../../../lib/contrast'
import type { TwitchUser } from '../../../types/twitch'

function user(overrides: Partial<TwitchUser> = {}): TwitchUser {
  return {
    id: '1',
    login: 'yourname',
    display_name: 'YourName',
    type: '',
    broadcaster_type: 'affiliate',
    description: '',
    profile_image_url: 'https://img.test/profile.png',
    offline_image_url: '',
    view_count: 0,
    created_at: '2016-03-04T00:00:00Z',
    ...overrides,
  }
}

interface StripOverrides {
  user?: TwitchUser
  chatColor?: string | null
  following?: number
  followingMore?: boolean
  liveCount?: number
  watching?: number
}

function renderStrip({
  user: u = user(),
  chatColor = '#FF7F50',
  following = 59,
  followingMore = false,
  liveCount = 17,
  watching = 8100,
}: StripOverrides = {}) {
  return render(
    <IdentityStrip
      user={u}
      chatColor={chatColor}
      following={following}
      followingMore={followingMore}
      liveCount={liveCount}
      watching={watching}
    />,
  )
}

describe('IdentityStrip', () => {
  it('shows the profile picture, named for the user', () => {
    renderStrip()

    expect(screen.getByRole('img', { name: 'YourName profile picture' })).toHaveAttribute(
      'src',
      'https://img.test/profile.png',
    )
  })

  it('shows the initial letter instead of a broken image when there is no picture', () => {
    renderStrip({ user: user({ profile_image_url: '' }) })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Y')).toBeInTheDocument()
  })

  it('colours the name with the chat colour when it already reads well on the background', () => {
    renderStrip({ chatColor: '#FF7F50' })

    expect(screen.getByText('YourName')).toHaveStyle({ color: '#FF7F50' })
  })

  it('lightens a chat colour that is too dark to read', () => {
    renderStrip({ chatColor: '#000000' })

    const lightened = ensureContrast('#000000') as string
    expect(contrastRatio(lightened, DASHBOARD_BG) as number).toBeGreaterThanOrEqual(4.5)
    expect(screen.getByText('YourName')).toHaveStyle({ color: lightened })
  })

  it.each([null, 'not-a-colour'])('falls back to the normal text colour for %j', (chatColor) => {
    renderStrip({ chatColor })

    expect(screen.getByText('YourName').getAttribute('style')).toContain('var(--text-primary)')
  })

  it('shows the badge for an affiliate or partner and none for a plain account', () => {
    const first = renderStrip({ user: user({ broadcaster_type: 'affiliate' }) })
    expect(screen.getByText('AFFILIATE')).toBeInTheDocument()
    first.unmount()

    const second = renderStrip({ user: user({ broadcaster_type: 'partner' }) })
    expect(screen.getByText('PARTNER')).toBeInTheDocument()
    second.unmount()

    renderStrip({ user: user({ broadcaster_type: '' }) })
    expect(screen.queryByText('AFFILIATE')).not.toBeInTheDocument()
    expect(screen.queryByText('PARTNER')).not.toBeInTheDocument()
  })

  it('shows how many the viewer follows and since when they have had the account', () => {
    renderStrip()

    expect(screen.getByText('following 59')).toBeInTheDocument()
    expect(screen.getByText('account since 2016')).toBeInTheDocument()
  })

  // jsdom has no layout, so the phone layout is pinned by its classes and checked by eye at 375px.
  it('stacks the totals under the name on a phone and puts them on the right from md up', () => {
    const { container } = renderStrip()

    expect(container.firstElementChild).toHaveClass('flex-col', 'md:flex-row')
    const totals = screen.getByText('17 live of 59').parentElement
    expect(totals).toHaveClass('md:ml-auto', 'md:text-right')
  })

  // Seen at 375px with a 26-character name: with the strip stacked (items-start) the name
  // group is not stretched, so it must be capped at the strip's width or the badge is clipped.
  it('keeps a long name and its badge inside the strip', () => {
    renderStrip({ user: user({ display_name: 'A Rather Long Display Name' }) })

    expect(screen.getByText('A Rather Long Display Name').closest('.max-w-full')).not.toBeNull()
    expect(screen.getByText('AFFILIATE')).toHaveClass('shrink-0')
  })

  it('shows the live and watching totals on the right', () => {
    renderStrip()

    expect(screen.getByText('17 live of 59')).toBeInTheDocument()
    expect(screen.getByText('8.1k watching right now')).toBeInTheDocument()
  })

  it('marks the following count as a floor while more follows remain to load', () => {
    renderStrip({ followingMore: true })

    expect(screen.getByText('following 59+')).toBeInTheDocument()
    expect(screen.getByText('17 live of 59+')).toBeInTheDocument()
  })
})
