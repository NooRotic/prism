import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamErrorCard, StreamStallNotice } from '../StreamStatus'
import { probeStream, type ProbeResult } from '../../../lib/streamProbe'
import type { StreamKind } from '../../../lib/urlDetection'

vi.mock('../../../lib/streamProbe', () => ({ probeStream: vi.fn() }))

const probe = vi.mocked(probeStream)

function deferred() {
  let resolve!: (result: ProbeResult) => void
  const promise = new Promise<ProbeResult>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

interface CardOverrides {
  url?: string
  kind?: StreamKind
  guessedKind?: boolean
  playerError?: string | null
  onRetry?: () => void
  onTryAs?: (kind: StreamKind) => void
}

function card(overrides: CardOverrides = {}) {
  return (
    <StreamErrorCard
      url="https://h/a.m3u8"
      kind="hls"
      guessedKind={false}
      playerError={null}
      onRetry={() => {}}
      onTryAs={() => {}}
      {...overrides}
    />
  )
}

beforeEach(() => {
  probe.mockReset()
  probe.mockResolvedValue({ kind: 'ok' })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('StreamErrorCard diagnosis', () => {
  it.each<ProbeResult>([
    { kind: 'ok' },
    { kind: 'http', status: 404 },
    { kind: 'not-playlist' },
    { kind: 'unreachable' },
    { kind: 'mixed-content' },
  ])('says what the probe found: $kind', async (result) => {
    probe.mockResolvedValue(result)
    render(card())
    const explanation = await screen.findByTestId('probe-explanation')
    expect(explanation).toHaveAttribute('data-probe-result', result.kind)
  })

  it.each([
    ['hls', /an HLS stream/],
    ['dash', /a DASH stream/],
    ['mp4', /an MP4 stream/],
  ] as const)('uses the right article for a %s address that answers fine', async (kind, pattern) => {
    probe.mockResolvedValue({ kind: 'ok' })
    render(card({ kind }))
    expect(await screen.findByTestId('probe-explanation')).toHaveTextContent(pattern)
  })

  it('does not claim the player gave up when the address answers fine', async () => {
    probe.mockResolvedValue({ kind: 'ok' })
    render(card())
    expect(await screen.findByTestId('probe-explanation')).not.toHaveTextContent(/could not use it/)
  })

  it('names the status of a failed response', async () => {
    probe.mockResolvedValue({ kind: 'http', status: 404 })
    render(card())
    expect(await screen.findByTestId('probe-explanation')).toHaveTextContent('404')
  })

  it('words an unreachable address as a guess between down and CORS', async () => {
    probe.mockResolvedValue({ kind: 'unreachable' })
    render(card())
    const text = (await screen.findByTestId('probe-explanation')).textContent ?? ''
    expect(text).toMatch(/down/)
    expect(text).toMatch(/CORS/)
  })

  it('explains an http address on an https page', async () => {
    probe.mockResolvedValue({ kind: 'mixed-content' })
    render(card())
    expect(await screen.findByTestId('probe-explanation')).toHaveTextContent(/https/)
  })

  it('says it is checking until the probe answers', async () => {
    const pending = deferred()
    probe.mockReturnValue(pending.promise)
    render(card())
    expect(screen.getByText(/Checking the address/)).toBeInTheDocument()
    await act(async () => pending.resolve({ kind: 'ok' }))
    expect(screen.queryByText(/Checking the address/)).not.toBeInTheDocument()
  })

  it('shows what the player itself reported', async () => {
    render(card({ playerError: 'boom' }))
    expect(await screen.findByText(/boom/)).toBeInTheDocument()
  })

  it('does not show a result from an address that has since been replaced', async () => {
    const first = deferred()
    const second = deferred()
    probe.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { rerender } = render(card({ url: 'https://h/one.m3u8' }))
    rerender(card({ url: 'https://h/two.m3u8' }))

    await act(async () => first.resolve({ kind: 'http', status: 500 }))
    expect(screen.queryByText(/500/)).not.toBeInTheDocument()
    expect(screen.getByText(/Checking the address/)).toBeInTheDocument()

    await act(async () => second.resolve({ kind: 'not-playlist' }))
    expect(await screen.findByTestId('probe-explanation')).toHaveAttribute('data-probe-result', 'not-playlist')
    expect(probe).toHaveBeenCalledTimes(2)
  })
})

describe('StreamErrorCard actions', () => {
  it('retries', async () => {
    const onRetry = vi.fn()
    render(card({ onRetry }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('opens the address in a new tab without handing over the opener', () => {
    render(card({ url: 'https://h/a.m3u8' }))
    const link = screen.getByRole('link', { name: /open address/i })
    expect(link).toHaveAttribute('href', 'https://h/a.m3u8')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('copies the address', async () => {
    // user-event installs its own clipboard when it is set up, so set it up first and spy on that.
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    render(card({ url: 'https://h/a.m3u8' }))
    await user.click(screen.getByRole('button', { name: /copy address/i }))
    expect(writeText).toHaveBeenCalledWith('https://h/a.m3u8')
  })

  it('does not break when the browser has no clipboard', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    render(card())
    await user.click(screen.getByRole('button', { name: /copy address/i }))
    expect(screen.getByRole('button', { name: /copy address/i })).toBeInTheDocument()
  })

  it('offers the other kinds when the type was a guess', async () => {
    const onTryAs = vi.fn()
    render(card({ guessedKind: true, kind: 'hls', onTryAs }))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Try as DASH' }))
    await user.click(screen.getByRole('button', { name: 'Try as MP4' }))
    expect(onTryAs).toHaveBeenNthCalledWith(1, 'dash')
    expect(onTryAs).toHaveBeenNthCalledWith(2, 'mp4')
    expect(screen.queryByRole('button', { name: 'Try as HLS' })).not.toBeInTheDocument()
  })

  it('offers no other kinds when the type came from the address', () => {
    render(card({ guessedKind: false }))
    expect(screen.queryByRole('button', { name: /try as/i })).not.toBeInTheDocument()
  })
})

describe('StreamStallNotice', () => {
  it('says the stream is slow, diagnoses it, and offers Retry', async () => {
    const onRetry = vi.fn()
    probe.mockResolvedValue({ kind: 'unreachable' })
    render(
      <StreamStallNotice
        url="https://h/a.m3u8"
        kind="hls"
        guessedKind={false}
        onRetry={onRetry}
        onTryAs={() => {}}
      />,
    )
    expect(screen.getByText(/Still loading after 12 s/)).toBeInTheDocument()
    expect(await screen.findByTestId('probe-explanation')).toHaveAttribute('data-probe-result', 'unreachable')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
