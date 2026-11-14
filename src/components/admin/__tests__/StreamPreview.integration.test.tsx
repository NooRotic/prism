import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StreamPreview from '../StreamPreview'
import type { AdminStream } from '../../../lib/adminApi'

// The real preview, panel and error card; only the engines underneath are replaced. A failing player (it always gives up)
// and a probe that answers at once. `seen` records what the player was handed on every render.
const seen = vi.hoisted(() => ({ detections: [] as unknown[] }))
vi.mock('../../player/PlayerHost', () => ({
  default: ({ detection, renderError }: { detection: { type: string }; renderError: (error: string | null) => React.ReactNode }) => {
    seen.detections.push(detection)
    return (
      <div data-testid="player-host" data-type={detection.type}>
        {renderError('boom')}
      </div>
    )
  },
}))
vi.mock('../../layout/DebugPanel', () => ({ default: () => null }))
vi.mock('../../../lib/streamProbe', () => ({ probeStream: vi.fn(() => Promise.resolve({ kind: 'ok' })) }))

const ADDRESS = 'https://secret-host.test:8443/live/path.m3u8?x=1'

function stream(over: Partial<AdminStream> = {}): AdminStream {
  return {
    publicId: '0123456789ab',
    name: 'Alpha News',
    url: ADDRESS,
    groups: ['News'],
    country: 'us',
    kind: 'hls',
    state: 'held',
    stateReason: 'port',
    pinned: false,
    isDefault: false,
    source: 'manual',
    hasLogo: false,
    addedAt: '2026-11-14 03:00:00',
    ...over,
  }
}

const preview = (s: AdminStream, onClose = () => {}) => (
  <MemoryRouter>
    <StreamPreview stream={s} onClose={onClose} />
  </MemoryRouter>
)

beforeEach(() => {
  seen.detections.length = 0
})

describe('StreamPreview with the real player panel and error card', () => {
  it('offers the other types when the player gives up, and "try as" re-plays the same address as that type, in place', async () => {
    render(preview(stream()))
    expect(await screen.findByTestId('probe-explanation')).toBeInTheDocument()

    expect(screen.getByTestId('player-host')).toHaveAttribute('data-type', 'hls')
    expect(screen.queryByRole('button', { name: 'Try as HLS' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Try as MP4' })).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try as DASH' }))

    expect(screen.getByTestId('player-host')).toHaveAttribute('data-type', 'dash')
    expect(screen.getByRole('region', { name: 'Preview of Alpha News' })).toHaveTextContent('Playing as DASH · secret-host.test:8443')
    expect(await screen.findByTestId('probe-explanation')).toBeInTheDocument()
  })

  it('shows the PLAYBACK status and the debug output under the player once playback has failed, with no query value', async () => {
    render(preview(stream()))
    expect(await screen.findByTestId('probe-explanation')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /PLAYBACK/ })).toHaveAttribute('data-status', 'failed')
    const text = screen.getByLabelText('Playback debug output').textContent!
    expect(text).toContain('Status: failed')
    expect(text).toContain('Address: https://secret-host.test:8443/live/path.m3u8?x=***')
    expect(text).not.toContain('x=1')
    expect(screen.getByLabelText('Console output')).toBeInTheDocument()
  })

  it('does not hand the player a new detection when the screen re-renders, so a failed stream is not retried on its own', async () => {
    const view = render(preview(stream()))
    expect(await screen.findByTestId('probe-explanation')).toBeInTheDocument()

    // What happens when anything else on the Playlist screen changes: the same stream, a new close handler.
    view.rerender(preview(stream(), () => {}))
    view.rerender(preview(stream(), () => {}))

    expect(seen.detections.length).toBeGreaterThanOrEqual(3)
    expect(new Set(seen.detections).size).toBe(1)
    expect(screen.getByRole('alert')).toHaveTextContent("Can't play this stream")
  })
})
