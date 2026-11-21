import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import YoutubeRailSection, { type YoutubeRailState } from '../YoutubeRailSection'

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0)
const stream = { channelId: 'UC1', channelTitle: 'Chan One', videoId: 'vid1', title: 'Live now', viewerCount: 42, startedAt: null, avatarUrl: '' }

function state(over: Partial<YoutubeRailState> = {}): YoutubeRailState {
  return {
    streams: [],
    checkedAt: null,
    status: 'idle',
    allowance: { ok: true },
    quotaReached: false,
    now: NOW,
    check: vi.fn(),
    ...over,
  }
}
const renderSection = (s: YoutubeRailState, expanded = true) =>
  render(
    <MemoryRouter>
      <YoutubeRailSection live={s} expanded={expanded} />
    </MemoryRouter>,
  )

describe('YoutubeRailSection', () => {
  it('offers Check live and runs a check on click', () => {
    const s = state()
    renderSection(s)
    fireEvent.click(screen.getByRole('button', { name: 'Check live' }))
    expect(s.check).toHaveBeenCalledTimes(1)
  })

  it('keeps the button reachable as an icon when the rail is collapsed', () => {
    const s = state()
    renderSection(s, false)
    fireEvent.click(screen.getByRole('button', { name: 'Check live' }))
    expect(s.check).toHaveBeenCalledTimes(1)
  })

  it('lists live channels as links into the YouTube player page, with the age of the answer', () => {
    renderSection(state({ streams: [stream], checkedAt: NOW - 12 * 60 * 1000, status: 'ok', allowance: { ok: false, reason: 'cooldown', retryAt: NOW + 48 * 60 * 1000 } }))
    expect(screen.getByRole('link', { name: 'Chan One' })).toHaveAttribute('href', '/youtube/vid1')
    expect(screen.getByText(/checked 12 min ago/i)).toBeInTheDocument()
  })

  it('says nobody is live after a check that found nobody', () => {
    renderSection(state({ checkedAt: NOW - 60 * 1000, status: 'ok' }))
    expect(screen.getByText(/nobody you subscribe to is live/i)).toBeInTheDocument()
  })

  it('disables the button during the cooldown and says when the next check opens', () => {
    renderSection(state({ allowance: { ok: false, reason: 'cooldown', retryAt: NOW + 48 * 60 * 1000 } }))
    expect(screen.getByRole('button', { name: 'Check live' })).toBeDisabled()
    expect(screen.getByText(/next check in 48 min/i)).toBeInTheDocument()
  })

  it('explains the daily limit', () => {
    renderSection(state({ allowance: { ok: false, reason: 'daily', retryAt: NOW + 5 * 60 * 60 * 1000 } }))
    expect(screen.getByRole('button', { name: 'Check live' })).toBeDisabled()
    expect(screen.getByText(/5 checks a day/i)).toBeInTheDocument()
  })

  it('shows a busy state while checking', () => {
    renderSection(state({ status: 'checking' }))
    expect(screen.getByRole('button', { name: 'Check live' })).toBeDisabled()
    expect(screen.getByText(/checking/i)).toBeInTheDocument()
  })

  it('says so, and disables the button, when YouTube’s daily limit is used up', () => {
    renderSection(state({ quotaReached: true }))
    expect(screen.getByRole('button', { name: 'Check live' })).toBeDisabled()
    expect(screen.getByText(/daily limit/i)).toBeInTheDocument()
  })

  it('says a failed check could not reach YouTube', () => {
    renderSection(state({ status: 'error' }))
    expect(screen.getByText(/could not reach youtube/i)).toBeInTheDocument()
  })
})
