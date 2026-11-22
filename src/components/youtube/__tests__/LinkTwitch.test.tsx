import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LinkTwitch from '../LinkTwitch'
import VideoMeta from '../VideoMeta'
import { saveLink } from '../../../lib/linkedAccounts'
import type { VideoPageData } from '../../../lib/videoPageApi'

vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: () => ({ isAuthenticated: true, login: vi.fn() }) }))

const CH = 'UCX6OQ3DkcsbYNE6H8uQQuVA'
const renderIt = (description = '') => render(<LinkTwitch channelId={CH} channelTitle="Foo" description={description} />)

beforeEach(() => localStorage.clear())

describe('LinkTwitch', () => {
  it('offers Link Twitch, drawn as a PRISM feature, when the channel is not linked', () => {
    renderIt()
    const button = screen.getByRole('button', { name: /Link Twitch/ })
    expect(button.querySelector('[data-prism-mark="icon"]')).not.toBeNull()
    expect(button.parentElement).toHaveClass('prism-pill')
  })

  it('reads Edit links, with no suggestion, once linked', () => {
    renderIt('watch me on twitch.tv/foo_bar')
    act(() => saveLink({ twitch: 'foo', youtube: { channelId: CH, title: 'Foo' }, confirmed: false, linkedAt: 1 }))
    expect(screen.getByRole('button', { name: /Edit links/ })).toBeInTheDocument()
    expect(screen.queryByText(/Possibly/)).not.toBeInTheDocument()
  })

  it('offers the Twitch channel the description names, and opens the box filled in', () => {
    renderIt('Socials: https://www.twitch.tv/Foo_Bar and more')
    fireEvent.click(screen.getByRole('button', { name: 'Possibly twitch.tv/foo_bar?' }))
    expect(within(screen.getByRole('dialog', { name: 'Link Twitch' })).getByLabelText('Their Twitch channel')).toHaveValue('foo_bar')
  })

  it('remembers "not them" for this channel', () => {
    const { unmount } = renderIt('twitch.tv/foo_bar')
    fireEvent.click(screen.getByRole('button', { name: 'Not them' }))
    expect(screen.queryByText(/Possibly/)).not.toBeInTheDocument()
    unmount()
    renderIt('twitch.tv/foo_bar')
    expect(screen.queryByText(/Possibly/)).not.toBeInTheDocument()
  })

  it('suggests nothing when the description names no Twitch channel', () => {
    renderIt('twitch.tv/videos/123 and youtube.com/@x')
    expect(screen.queryByText(/Possibly/)).not.toBeInTheDocument()
  })
})

describe('VideoMeta and Link Twitch', () => {
  const data = (channelId: string): VideoPageData => ({
    id: 'abcdefghijk',
    title: 'A title',
    channelTitle: 'A channel',
    channelId,
    thumbnail: '',
    publishedAt: '2020-03-04T00:00:00Z',
    viewCount: '1',
    description: '',
    tags: [],
    topics: [],
    live: { state: 'none', viewerCount: null, startedAt: null },
  })

  it('shows Link Twitch beside a known channel', () => {
    render(<VideoMeta data={data(CH)} />)
    expect(screen.getByRole('button', { name: /Link Twitch/ })).toBeInTheDocument()
  })

  it('leaves it out when the channel is unknown', () => {
    render(<VideoMeta data={data('')} />)
    expect(screen.queryByRole('button', { name: /Link Twitch/ })).not.toBeInTheDocument()
  })
})
