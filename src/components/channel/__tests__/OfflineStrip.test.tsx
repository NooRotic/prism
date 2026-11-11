import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OfflineStrip from '../OfflineStrip'

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000

describe('OfflineStrip', () => {
  it('is plain page content, not a live region: its minute-by-minute text must not be announced again and again', () => {
    render(<OfflineStrip lastStreamedAt={NOW - 2 * DAY} now={NOW} folded onShowPlayer={() => {}} />)
    const strip = screen.getByTestId('offline-strip')
    expect(strip).not.toHaveAttribute('role', 'status')
    expect(strip).not.toHaveAttribute('aria-live')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says the channel is offline and how long ago it last streamed', () => {
    render(<OfflineStrip lastStreamedAt={NOW - 2 * DAY} now={NOW} folded onShowPlayer={() => {}} />)
    const strip = screen.getByTestId('offline-strip')
    expect(strip).toHaveTextContent('Offline')
    expect(strip).toHaveTextContent('last live 2 days ago')
  })

  it('leaves out the last-live text when it is not known, without any placeholder noise', () => {
    render(<OfflineStrip lastStreamedAt={null} now={NOW} folded onShowPlayer={() => {}} />)
    const strip = screen.getByTestId('offline-strip')
    expect(strip).toHaveTextContent('Offline')
    expect(strip).not.toHaveTextContent('last live')
    expect(strip).not.toHaveTextContent(/NaN|Invalid|undefined|null/)
  })

  it('offers "Show player" while folded and calls back on click', () => {
    const onShowPlayer = vi.fn()
    render(<OfflineStrip lastStreamedAt={null} now={NOW} folded onShowPlayer={onShowPlayer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show player' }))
    expect(onShowPlayer).toHaveBeenCalledTimes(1)
  })

  it('says the channel is live when it went live while the viewer was watching something else, and offers a way to the live stream', () => {
    const onWatchLive = vi.fn()
    render(<OfflineStrip lastStreamedAt={NOW - DAY} now={NOW} folded={false} live onWatchLive={onWatchLive} onShowPlayer={() => {}} />)
    const strip = screen.getByTestId('offline-strip')
    expect(strip).toHaveTextContent('Live now')
    expect(strip).not.toHaveTextContent('Offline')
    expect(strip).not.toHaveTextContent('last live')
    fireEvent.click(screen.getByRole('button', { name: 'Watch live' }))
    expect(onWatchLive).toHaveBeenCalledTimes(1)
  })

  it('says only "Live now" when it is live and the player is already on the live stream (no way-to-live button)', () => {
    render(<OfflineStrip lastStreamedAt={null} now={NOW} folded={false} live onShowPlayer={() => {}} />)
    expect(screen.getByTestId('offline-strip')).toHaveTextContent('Live now')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('has no button once the player is shown', () => {
    render(<OfflineStrip lastStreamedAt={NOW - DAY} now={NOW} folded={false} onShowPlayer={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByTestId('offline-strip')).toHaveTextContent('Offline')
  })
})
