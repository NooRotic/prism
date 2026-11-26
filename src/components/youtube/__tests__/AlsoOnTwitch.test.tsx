import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AlsoOnTwitch from '../AlsoOnTwitch'
import VideoMeta from '../VideoMeta'
import { trackEvent } from '../../../lib/analytics'
import { removeLink, saveLink } from '../../../lib/linkedAccounts'
import type { VideoPageData } from '../../../lib/videoPageApi'

vi.mock('../../../lib/analytics', async (original) => ({ ...(await original<typeof import('../../../lib/analytics')>()), trackEvent: vi.fn() }))

const CHANNEL = 'UCX6OQ3DkcsbYNE6H8uQQuVA'
const link = (confirmed: boolean) => ({ twitch: 'jwonggg', youtube: { channelId: CHANNEL, title: 'Justin Wong', handle: '@jwonggg' }, confirmed, linkedAt: 1 })
const renderIt = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => localStorage.clear())

describe('AlsoOnTwitch', () => {
  it('shows nothing when this YouTube channel has no link', () => {
    renderIt(<AlsoOnTwitch channelId={CHANNEL} />)
    expect(screen.queryByText(/Also on/)).not.toBeInTheDocument()
  })

  it('links to the Twitch channel in PRISM, and says it is confirmed when both bios agree', () => {
    saveLink(link(true))
    renderIt(<AlsoOnTwitch channelId={CHANNEL} />)
    expect(screen.getByText(/Also on/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Twitch/ })).toHaveAttribute('href', '/twitch/jwonggg')
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument()
  })

  it('shows the Twitch chip in Twitch purple', () => {
    saveLink(link(true))
    renderIt(<AlsoOnTwitch channelId={CHANNEL} />)
    expect(screen.getByRole('link', { name: /Twitch/ })).toHaveStyle({ color: 'var(--accent-twitch-text)' })
  })

  it('says "linked by you" for a link the viewer made', () => {
    saveLink(link(false))
    renderIt(<AlsoOnTwitch channelId={CHANNEL} />)
    expect(screen.getByText(/linked by you/i)).toBeInTheDocument()
  })

  it('does not match another YouTube channel', () => {
    saveLink(link(true))
    renderIt(<AlsoOnTwitch channelId="UCsomeoneelse000000000000" />)
    expect(screen.queryByText(/Also on/)).not.toBeInTheDocument()
  })

  it('appears when a link is made and goes when it is removed, without a reload', () => {
    renderIt(<AlsoOnTwitch channelId={CHANNEL} />)
    act(() => saveLink(link(true)))
    expect(screen.getByRole('link', { name: /Twitch/ })).toBeInTheDocument()
    act(() => removeLink('jwonggg'))
    expect(screen.queryByRole('link', { name: /Twitch/ })).not.toBeInTheDocument()
  })

  it('shows on the video page next to the channel name', () => {
    saveLink(link(true))
    const data: VideoPageData = { id: 'abcdefghijk', title: 'T', channelTitle: 'Justin Wong', channelId: CHANNEL, thumbnail: '', publishedAt: '2026-01-01T00:00:00Z', description: '', tags: [], topics: [], live: { state: 'none', viewerCount: null, startedAt: null } }
    renderIt(<VideoMeta data={data} />)
    const name = screen.getByText('Justin Wong')
    expect(name.parentElement!.contains(screen.getByRole('link', { name: /Twitch/ }))).toBe(true)
  })
})

it('counts opening the linked Twitch channel', () => {
  vi.mocked(trackEvent).mockClear()
  saveLink(link(true))
  renderIt(<AlsoOnTwitch channelId={CHANNEL} />)
  expect(trackEvent).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('link', { name: /Twitch/ }))
  expect(vi.mocked(trackEvent).mock.calls).toEqual([['Linking', 'followed', 'twitch/jwonggg <-> youtube/Justin Wong']])
})
