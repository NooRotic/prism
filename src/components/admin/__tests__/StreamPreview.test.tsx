import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import StreamPreview from '../StreamPreview'
import type { AdminStream } from '../../../lib/adminApi'

// A stand-in for the real player: it shows what the preview handed it, and can ask for another type.
vi.mock('../../player/StreamPlayerPanel', () => ({
  default: ({ source, onTryAs }: { source: { url: string; kind: string }; onTryAs: (kind: 'hls' | 'dash' | 'mp4') => void }) => (
    <div data-testid="panel" data-kind={source.kind} data-url={source.url}>
      <button type="button" onClick={() => onTryAs('dash')}>
        try as dash
      </button>
    </div>
  ),
}))

const URL_OF = 'https://secret-host.test:8443/live/path.m3u8?x=1'

function stream(over: Partial<AdminStream> = {}): AdminStream {
  return {
    publicId: '0123456789ab',
    name: 'Alpha News',
    url: URL_OF,
    groups: ['News'],
    country: 'us',
    kind: 'hls',
    state: 'new',
    stateReason: null,
    pinned: false,
    isDefault: false,
    source: 'manual',
    hasLogo: false,
    addedAt: '2026-11-14 03:00:00',
    ...over,
  }
}

const link = () => screen.getByRole('link', { name: 'Open in a new tab' })

describe('StreamPreview', () => {
  it('is a region named for the stream, says what is playing and where from (the host only), and hands the player the full address', () => {
    render(<StreamPreview stream={stream()} onClose={vi.fn()} />)

    const region = screen.getByRole('region', { name: 'Preview of Alpha News' })
    expect(region).toHaveTextContent('Playing as HLS · secret-host.test:8443')
    expect(region).not.toHaveTextContent('path.m3u8')
    expect(screen.getByTestId('panel')).toHaveAttribute('data-url', URL_OF)
    expect(screen.getByTestId('panel')).toHaveAttribute('data-kind', 'hls')
  })

  it('starts as the stored kind', () => {
    render(<StreamPreview stream={stream({ kind: 'dash' })} onClose={vi.fn()} />)

    expect(screen.getByRole('region')).toHaveTextContent('Playing as DASH')
    expect(screen.getByTestId('panel')).toHaveAttribute('data-kind', 'dash')
  })

  it('closes when Close is pressed', async () => {
    const onClose = vi.fn()
    render(<StreamPreview stream={stream()} onClose={onClose} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each(['new', 'working', 'suspect'] as const)('a %s stream opens on its own visitor page, in a new tab', (state) => {
    render(<StreamPreview stream={stream({ state })} onClose={vi.fn()} />)

    expect(link()).toHaveAttribute('href', '/hls-dash/0123456789ab')
    expect(link()).toHaveAttribute('target', '_blank')
    expect(link().getAttribute('rel')).toContain('noopener')
  })

  it.each(['held', 'unplayable', 'dead'] as const)('a %s stream (not on the visitor page) opens through the pasted-address page', (state) => {
    render(<StreamPreview stream={stream({ state })} onClose={vi.fn()} />)

    expect(link()).toHaveAttribute('href', `/hls-dash/custom?url=${encodeURIComponent(URL_OF)}&as=hls`)
    expect(link()).toHaveAttribute('target', '_blank')
    expect(link().getAttribute('rel')).toContain('noopener')
  })

  it('"try as" changes the previewed type, the line and the pasted-address link', async () => {
    render(<StreamPreview stream={stream({ state: 'held' })} onClose={vi.fn()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'try as dash' }))

    expect(screen.getByRole('region')).toHaveTextContent('Playing as DASH')
    expect(screen.getByTestId('panel')).toHaveAttribute('data-kind', 'dash')
    expect(link()).toHaveAttribute('href', `/hls-dash/custom?url=${encodeURIComponent(URL_OF)}&as=dash`)
  })

  it('"try as" leaves the visitor-page link of a listed stream alone', async () => {
    render(<StreamPreview stream={stream({ state: 'working' })} onClose={vi.fn()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'try as dash' }))

    expect(screen.getByTestId('panel')).toHaveAttribute('data-kind', 'dash')
    expect(link()).toHaveAttribute('href', '/hls-dash/0123456789ab')
  })

  it.each([
    ['an address that is not http or https', 'rtmp://x.test/a'],
    ['a Twitch address', 'https://www.twitch.tv/somebody'],
    ['a YouTube address', 'https://youtu.be/abcdefghijk'],
  ])('says so, with no player, for %s', async (_label, url) => {
    const onClose = vi.fn()
    render(<StreamPreview stream={stream({ url })} onClose={onClose} />)

    expect(screen.getByRole('region')).toHaveTextContent('This address cannot be played here.')
    expect(screen.queryByTestId('panel')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
