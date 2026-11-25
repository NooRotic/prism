import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LinkTwitchModal from '../LinkTwitchModal'
import { trackEvent } from '../../../lib/analytics'
import { getUserInfo, SessionExpiredError } from '../../../lib/twitchApi'
import { fetchYoutubeChannel } from '../../../lib/youtubeChannelApi'
import { findByTwitch, findByYoutube, saveLink } from '../../../lib/linkedAccounts'
import type { TwitchUser } from '../../../types/twitch'

vi.mock('../../../lib/twitchApi', async (orig) => ({ ...(await orig<typeof import('../../../lib/twitchApi')>()), getUserInfo: vi.fn() }))
vi.mock('../../../lib/youtubeChannelApi', () => ({ fetchYoutubeChannel: vi.fn() }))
vi.mock('../../../lib/analytics', async (original) => ({ ...(await original<typeof import('../../../lib/analytics')>()), trackEvent: vi.fn() }))
const auth = vi.hoisted(() => ({ isAuthenticated: true, login: vi.fn(), handleAuthError: vi.fn() }))
vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: () => auth }))

const CH = 'UCX6OQ3DkcsbYNE6H8uQQuVA'
const user = (login: string, description = ''): TwitchUser => ({
  id: '1',
  login,
  display_name: login,
  type: '',
  broadcaster_type: '',
  description,
  profile_image_url: '',
  offline_image_url: '',
  view_count: 0,
  created_at: '',
})
const ytChannel = (description: string) => ({ status: 'ok' as const, channel: { channelId: CH, title: 'Foo YT', handle: '@foo', description, thumbnail: '' } })

const onClose = vi.fn()
function renderIt(props: { suggested?: string } = {}) {
  return render(<LinkTwitchModal channelId={CH} channelTitle="Foo on YouTube" onClose={onClose} {...props} />)
}
const dialog = () => screen.getByRole('dialog', { name: 'Link Twitch' })
const fill = (value: string) => fireEvent.change(within(dialog()).getByLabelText('Their Twitch channel'), { target: { value } })
const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Check and save' }))

beforeEach(() => {
  localStorage.clear()
  auth.isAuthenticated = true
  auth.login.mockReset()
  auth.handleAuthError.mockReset()
  onClose.mockReset()
  vi.mocked(getUserInfo).mockReset()
  vi.mocked(fetchYoutubeChannel).mockReset()
  vi.mocked(trackEvent).mockClear()
})

describe('LinkTwitchModal', () => {
  it('asks a signed-out viewer to sign in to Twitch instead of saving', () => {
    auth.isAuthenticated = false
    renderIt()
    expect(within(dialog()).getByText('Sign in to Twitch to link this channel.')).toBeInTheDocument()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Sign in with Twitch' }))
    expect(auth.login).toHaveBeenCalled()
    expect(within(dialog()).queryByRole('button', { name: 'Check and save' })).not.toBeInTheDocument()
  })

  it('closes with Escape when signed out too (focus starts inside the box)', () => {
    auth.isAuthenticated = false
    renderIt()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes with Escape even when focus has left the box', () => {
    renderIt()
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('starts with the suggested name, titled for this YouTube channel', () => {
    renderIt({ suggested: 'foo_bar' })
    expect(within(dialog()).getByText('Link Twitch for Foo on YouTube')).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Their Twitch channel')).toHaveValue('foo_bar')
  })

  it('starts with the linked login when already linked, and can remove the link', () => {
    saveLink({ twitch: 'foo', youtube: { channelId: CH, title: 'Foo YT' }, confirmed: false, linkedAt: 1 })
    renderIt()
    expect(within(dialog()).getByLabelText('Their Twitch channel')).toHaveValue('foo')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove link' }))
    expect(findByYoutube(CH)).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('rejects text that is not a Twitch channel without looking anything up', () => {
    renderIt()
    fill('https://youtube.com/@foo')
    save()
    expect(within(dialog()).getByRole('alert')).toHaveTextContent("That doesn't look like a Twitch channel. Use twitch.tv/name or just the name.")
    expect(getUserInfo).not.toHaveBeenCalled()
  })

  it('says so when Twitch has no such channel, and saves nothing', async () => {
    vi.mocked(getUserInfo).mockRejectedValue(new Error('User not found'))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel(''))
    renderIt()
    fill('twitch.tv/nobody_here')
    save()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('No Twitch channel found for that name.')
    expect(findByYoutube(CH)).toBeNull()
  })

  it('reads a name Twitch refuses as malformed (400) as no such channel', async () => {
    vi.mocked(getUserInfo).mockRejectedValue(new Error('Twitch API error: 400 Invalid login names'))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel(''))
    renderIt()
    fill('_foo')
    save()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('No Twitch channel found for that name.')
  })

  it('tells a Twitch outage apart from a missing channel', async () => {
    vi.mocked(getUserInfo).mockRejectedValue(new Error('Twitch API error: 500 oops'))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel(''))
    renderIt()
    fill('foo')
    save()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Could not reach Twitch. Try again in a moment.')
  })

  it('treats an expired Twitch session as signed out', async () => {
    vi.mocked(getUserInfo).mockRejectedValue(new SessionExpiredError())
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel(''))
    renderIt()
    fill('foo')
    save()
    expect(await within(dialog()).findByText('Sign in to Twitch to link this channel.')).toBeInTheDocument()
    expect(findByYoutube(CH)).toBeNull()
    // The whole app learns the session ended, not just this box.
    expect(auth.handleAuthError).toHaveBeenCalledWith(expect.any(SessionExpiredError))
  })

  it('saves nothing when the box is cancelled while it is still checking', async () => {
    let finish: (u: TwitchUser) => void = () => {}
    vi.mocked(getUserInfo).mockReturnValue(new Promise((r) => (finish = r)))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel(''))
    const { unmount } = renderIt()
    fill('foo')
    save()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    unmount()
    finish(user('foo'))
    await new Promise((r) => setTimeout(r, 0))
    expect(findByTwitch('foo')).toBeNull()
  })

  it('saves as confirmed when both bios name each other', async () => {
    vi.mocked(getUserInfo).mockResolvedValue(user('foo', `my YouTube: youtube.com/channel/${CH}`))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel('live on twitch.tv/foo'))
    renderIt()
    fill('https://www.twitch.tv/Foo')
    save()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(fetchYoutubeChannel).toHaveBeenCalledWith({ channelId: CH })
    expect(findByTwitch('foo')).toMatchObject({ youtube: { channelId: CH, title: 'Foo YT', handle: '@foo' }, confirmed: true })
  })

  it("saves as the viewer's claim when the bios do not name each other", async () => {
    vi.mocked(getUserInfo).mockResolvedValue(user('foo', 'nothing here'))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel('live on twitch.tv/foo'))
    renderIt()
    fill('foo')
    save()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(findByTwitch('foo')?.confirmed).toBe(false)
  })

  it("still saves (as the viewer's claim, with the page's title) when the YouTube lookup fails", async () => {
    vi.mocked(getUserInfo).mockResolvedValue(user('foo', `youtube.com/channel/${CH}`))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'error' })
    renderIt()
    fill('foo')
    save()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(findByTwitch('foo')).toMatchObject({ youtube: { channelId: CH, title: 'Foo on YouTube' }, confirmed: false })
  })

  it('warns before replacing the YouTube channel a Twitch channel is already linked to, then replaces it', async () => {
    saveLink({ twitch: 'foo', youtube: { channelId: 'UC9', title: 'Other' }, confirmed: true, linkedAt: 1 })
    vi.mocked(getUserInfo).mockResolvedValue(user('foo'))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel(''))
    renderIt()
    fill('foo')
    save()
    expect(await within(dialog()).findByText('foo is linked to Other on YouTube. Save to replace it.')).toBeInTheDocument()
    expect(findByTwitch('foo')?.youtube?.channelId).toBe('UC9')
    expect(onClose).not.toHaveBeenCalled()
    save()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(findByTwitch('foo')?.youtube?.channelId).toBe(CH)
  })
})

describe('LinkTwitchModal: what is counted', () => {
  const counted = () => vi.mocked(trackEvent).mock.calls
  const saveAs = async (login: string) => {
    vi.mocked(getUserInfo).mockResolvedValue(user(login))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel(''))
    fill(login)
    save()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  }

  it('a link the viewer saves', async () => {
    renderIt()
    await saveAs('Foo')

    expect(counted()).toEqual([['Linking', 'linked', 'twitch/foo <-> youtube/Foo YT']])
  })

  it('not a link saved again unchanged', async () => {
    saveLink({ twitch: 'foo', youtube: { channelId: CH, title: 'Foo YT', handle: '@foo' }, confirmed: false, linkedAt: 1 })
    renderIt()
    await saveAs('foo')

    expect(counted()).toEqual([])
  })

  it('the whole set when the Twitch channel already has a Kick link', async () => {
    saveLink({ twitch: 'foo', kick: { slug: 'fookick' }, confirmed: false, linkedAt: 1 })
    renderIt()
    await saveAs('foo')

    expect(counted()).toEqual([['Linking', 'linked', 'twitch/foo <-> youtube/Foo YT + kick/fookick']])
  })

  it('removing the link, by what it was', () => {
    saveLink({ twitch: 'foo', youtube: { channelId: CH, title: 'Foo YT' }, kick: { slug: 'fookick' }, confirmed: false, linkedAt: 1 })
    renderIt()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove link' }))

    expect(counted()).toEqual([['Linking', 'unlinked', 'twitch/foo <-> youtube/Foo YT']])
  })

  it('nothing when Twitch has no such channel', async () => {
    vi.mocked(getUserInfo).mockRejectedValue(new Error('User not found'))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(ytChannel(''))
    renderIt()
    fill('nobody_here')
    save()
    await within(dialog()).findByRole('alert')

    expect(counted()).toEqual([])
  })

  it('tells the viewer so: the links stay here, and that they are counted is said to a counted visitor', () => {
    renderIt()

    expect(within(dialog()).getByText('Links stay in this browser.')).toHaveClass('uncounted-note')
    expect(within(dialog()).getByText('Links are kept in this browser. Which accounts are linked is counted, without your name.')).toHaveClass('counted-note')
  })
})
