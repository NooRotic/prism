import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlaybackDebug from '../PlaybackDebug'
import { beginPlayback, endPlayback, logPlayback, setAvoidedFormats, setPlaybackInspection, setPlaybackStatus } from '../../../lib/playbackLog'

const ADDRESS = 'https://host.test/live/a.m3u8?token=secret'
const begin = () => act(() => beginPlayback({ url: ADDRESS, kind: 'hls' }))
const statusButton = () => screen.getByRole('button', { name: /PLAYBACK/ })
const output = () => screen.queryByLabelText('Playback debug output')

beforeEach(() => {
  endPlayback()
  setAvoidedFormats([])
})

afterEach(() => {
  endPlayback()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('PlaybackDebug', () => {
  it('shows nothing while no stream is playing', () => {
    const { container } = render(<PlaybackDebug />)

    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['starting', undefined, '--accent-orange', 'starting'],
    ['retrying', 'retrying', '--accent-red', 'retrying · attempt 2'],
    ['failed', 'failed', '--accent-red', 'failed'],
    ['playing', 'playing', '--accent-green', 'playing'],
  ] as const)('the PLAYBACK button of a %s stream says so, in the right colour', (status, move, colour, words) => {
    render(<PlaybackDebug />)
    begin()
    if (move) act(() => setPlaybackStatus(move))

    expect(statusButton()).toHaveTextContent(`PLAYBACK ${words}`)
    expect(statusButton().className).toContain(colour)
    expect(statusButton().getAttribute('data-status')).toBe(status)
  })

  it('goes from red to green when playback is reached', () => {
    render(<PlaybackDebug />)
    begin()
    act(() => setPlaybackStatus('retrying'))
    expect(statusButton().className).toContain('--accent-red')

    act(() => setPlaybackStatus('playing'))

    expect(statusButton().className).toContain('--accent-green')
  })

  it('shows the newest two lines as the console output, green for a pass and red for a fail, with no query value', () => {
    render(<PlaybackDebug />)
    begin()
    act(() => {
      logPlayback('info', 'videojs', 'loadstart')
      logPlayback('ok', 'videojs', 'playing')
      logPlayback('error', 'videojs', 'Failed loading https://host.test/live/a.m3u8?token=secret now')
    })

    const lines = within(screen.getByLabelText('Console output')).getAllByRole('listitem')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveTextContent(/^✓ \+\d+\.\ds videojs: playing$/)
    expect(lines[0].getAttribute('data-level')).toBe('ok')
    expect(lines[0].className).toContain('--accent-green')
    expect(lines[1]).toHaveTextContent('✗')
    expect(lines[1]).toHaveTextContent('Failed loading https://host.test/live/a.m3u8?token=*** now')
    expect(lines[1].textContent).not.toContain('secret')
    expect(lines[1].getAttribute('data-level')).toBe('error')
    expect(lines[1].className).toContain('--accent-red')
  })

  it('shows a warning in amber, not as a failure', () => {
    render(<PlaybackDebug />)
    begin()
    act(() => logPlayback('warn', 'videojs', 'waiting for data (buffering)'))

    const line = within(screen.getByLabelText('Console output')).getAllByRole('listitem').at(-1)!
    expect(line.className).toContain('--accent-orange')
    expect(line).not.toHaveTextContent('✗')
  })

  it('keeps the verbose output closed while playing, and opens and closes it with the PLAYBACK button', async () => {
    const user = userEvent.setup()
    render(<PlaybackDebug />)
    begin()
    act(() => setPlaybackStatus('playing'))
    expect(output()).toBeNull()
    expect(statusButton()).toHaveAttribute('aria-expanded', 'false')

    await user.click(statusButton())
    expect(output()).toBeInTheDocument()
    expect(statusButton()).toHaveAttribute('aria-expanded', 'true')

    await user.click(statusButton())
    expect(output()).toBeNull()
  })

  it('opens the verbose output by itself while retrying or after a failure, and lets the owner close it', async () => {
    const user = userEvent.setup()
    render(<PlaybackDebug />)
    begin()
    expect(output()).toBeNull()

    act(() => setPlaybackStatus('retrying'))
    expect(output()).toBeInTheDocument()

    await user.click(statusButton())
    expect(output()).toBeNull()
    act(() => {
      logPlayback('error', 'videojs', 'another line')
      setPlaybackStatus('failed')
    })
    expect(output()).toBeNull()
  })

  it('starts over with the next session: a closed output opens again for its failure', async () => {
    const user = userEvent.setup()
    render(<PlaybackDebug />)
    begin()
    act(() => setPlaybackStatus('failed'))
    await user.click(statusButton())
    expect(output()).toBeNull()

    begin()
    act(() => setPlaybackStatus('failed'))

    expect(output()).toBeInTheDocument()
  })

  it('the verbose output holds the report: every attempt, the avoided formats, the inspection and the browser, and no query value', () => {
    render(<PlaybackDebug />)
    begin()
    act(() => {
      logPlayback('error', 'videojs', 'Video.js error 3: decode', { code: 3 })
      setPlaybackStatus('retrying')
      setPlaybackInspection({ readyState: 0, rendition: '544x306' })
      setAvoidedFormats(['hevc'])
    })

    const text = output()!.textContent!
    expect(text).toContain('Address: https://host.test/live/a.m3u8?token=***')
    expect(text).not.toContain('secret')
    expect(text).toContain('Attempt 1: session started')
    expect(text).toContain('Attempt 2: retrying')
    expect(text).toContain('Avoided formats: hevc')
    expect(text).toContain('Video.js error 3: decode')
    expect(text).toContain('rendition: 544x306')
    expect(text).toContain('userAgent:')
    expect(text).toContain('codecs:')
  })

  it('copies the same report with Copy report, and says so', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<PlaybackDebug />)
    begin()
    act(() => setPlaybackStatus('failed'))

    await user.click(screen.getByRole('button', { name: 'Copy report' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toBe(output()!.textContent)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it.each([
    ['refuses the copy', { writeText: vi.fn().mockRejectedValue(new Error('denied')) }],
    ['has no clipboard', undefined],
  ])('says so, and does not throw, when the browser %s', async (_label, clipboard) => {
    const user = userEvent.setup()
    // user-event puts a clipboard of its own on the page when it is set up: replace it after.
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
    render(<PlaybackDebug />)
    begin()
    act(() => setPlaybackStatus('failed'))

    await user.click(screen.getByRole('button', { name: 'Copy report' }))

    expect(await screen.findByRole('button', { name: 'Could not copy' })).toBeInTheDocument()
  })
})
