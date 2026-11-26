import { Resvg } from '@resvg/resvg-js'
import { act, render, screen, within } from '@testing-library/react'
import jsQR from 'jsqr'
import { shareUrl } from '../../lib/cast/qrCode'
import type { CastLoadData, CastStream, ContextMessage, NowMessage } from '../../lib/cast/messages'
import type { CastEngine, EngineReport, EngineSample } from '../../lib/cast/tuner'
import { loadStreamSnapshot, refreshStreamSnapshot, type StreamEntry, type StreamSnapshot } from '../../lib/streamsApi'
import { fetchTvSettings } from '../../lib/tvSettingsApi'
import TvApp from '../TvApp'

vi.mock('../../lib/streamsApi', async (original) => ({ ...(await original<object>()), loadStreamSnapshot: vi.fn(), refreshStreamSnapshot: vi.fn() }))
vi.mock('../../lib/tvSettingsApi', () => ({ fetchTvSettings: vi.fn() }))

const entry = (id: string, name: string, groups: number[] = [0]): StreamEntry => ({ id, name, groups, country: 'us', logo: null, kind: 'hls', pinned: false, state: 'working', url: `https://secret-host.test/${id}.m3u8?token=hunter2` })
const NEWS = entry('news', 'News One')
const SPORTS = entry('sports', 'Sports Live', [1])
const FILMS = entry('films', 'Retro Films', [1])
const LIST: StreamSnapshot = { generated: '', defaultId: null, groups: ['News', 'Fun'], streams: [NEWS, SPORTS, FILMS] }
const SENT: CastStream = { id: 'news', name: 'News One', url: NEWS.url, kind: 'hls', live: true, logo: null }
const DATA: CastLoadData = { v: 1, id: 'news', kind: 'hls', live: true, favorites: ['news', 'films'], group: null }

let sample: EngineSample | null
let report: EngineReport
let reportCalls: number
let loads: CastStream[]
let senderLoad: (stream: CastStream, data: CastLoadData | null) => void
let sendContext: (message: ContextMessage) => void
let engineError: () => void
let sent: NowMessage[]
const leave = vi.fn()

const engine: CastEngine = {
  load: (stream) => {
    loads.push(stream)
    return Promise.resolve()
  },
  stop: () => {},
  sample: () => sample,
  report: () => {
    reportCalls += 1
    return report
  },
  onError: (l) => {
    engineError = l
    return () => {}
  },
  onSenderLoad: (l) => {
    senderLoad = l
    return () => {}
  },
}

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

/** A key with its own time, as the device stamps it. */
function key(name: string, type: 'keydown' | 'keyup' = 'keydown') {
  const event = new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'timeStamp', { value: performance.now() })
  act(() => {
    document.body.dispatchEvent(event)
  })
  return event
}
/** A press of its own: far enough from the last. */
function press(name: string) {
  wait(700)
  return key(name)
}

/** The picture moves for this long. */
function plays(ms: number) {
  for (let t = 0; t < ms; t += 250) {
    sample = { time: (sample?.time ?? 0) + 0.25, paused: false, ended: false, stopped: false }
    wait(250)
  }
}

async function open(list: StreamSnapshot | null = LIST) {
  vi.mocked(loadStreamSnapshot).mockResolvedValue(list ? { kind: 'ready', snapshot: list } : { kind: 'unavailable' })
  vi.mocked(refreshStreamSnapshot).mockResolvedValue({ kind: 'unavailable' })
  const utils = render(
    <TvApp
      engine={engine}
      sendNow={(m) => sent.push(m)}
      leave={leave}
      onContext={(l) => {
        sendContext = l
        return () => {}
      }}
    />,
  )
  await act(async () => {})
  return utils
}

async function playing() {
  const utils = await open()
  act(() => senderLoad(SENT, DATA))
  plays(1000)
  return utils
}

const banner = () => screen.queryByTestId('tv-banner')
const card = () => screen.queryByTestId('tv-card')
const clock = () => screen.queryByTestId('tv-clock')
const now = () => screen.queryByTestId('tv-now')
const SHARE = 'Scan to watch it on your phone, star it or share it'
const guide = () => screen.queryByRole('listbox')
const highlighted = () => within(screen.getByRole('listbox')).getByRole('option', { selected: true })

beforeEach(() => {
  vi.useFakeTimers()
  sample = null
  report = { engine: 'shaka', step: null }
  reportCalls = 0
  vi.mocked(fetchTvSettings).mockReset().mockResolvedValue(null)
  loads = []
  sent = []
  leave.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('with nothing to play', () => {
  it('says where to pick', async () => {
    await open()
    expect(screen.getByText('Pick a stream in PRISM')).toBeInTheDocument()
    expect(sent.at(-1)).toMatchObject({ id: null, state: 'idle' })
  })
})

describe('the banner', () => {
  it('names the channel while it tunes, and goes 4 s after the picture starts', async () => {
    await open()
    act(() => senderLoad(SENT, DATA))
    expect(banner()).toHaveTextContent('News One')
    expect(banner()).toHaveTextContent('Tuning…')
    plays(1000)
    expect(banner()).not.toHaveTextContent('Tuning…')
    plays(2500)
    expect(banner()).not.toBeNull()
    plays(1500)
    expect(banner()).toBeNull()
  })

  it('names the group the channel is in', async () => {
    await open()
    act(() => senderLoad({ ...SENT, id: 'sports', name: 'Sports Live' }, { ...DATA, id: 'sports' }))
    expect(banner()).toHaveTextContent('Fun')
  })

  it('says Paused for as long as it is, and Buffering… while it waits', async () => {
    await playing()
    plays(5000)
    sample = { time: 50, paused: true, ended: false, stopped: false }
    wait(250)
    expect(banner()).toHaveTextContent('Paused')
    wait(60_000)
    expect(banner()).toHaveTextContent('Paused')
    sample = { time: 50, paused: false, ended: false, stopped: false }
    wait(1500)
    expect(banner()).toHaveTextContent('Buffering…')
    plays(5000)
    expect(banner()).toBeNull()
  })
})

describe('flipping with the guide closed', () => {
  it('shows the next favorite at once and tunes it 600 ms later', async () => {
    await playing()
    plays(6000)
    press('ArrowDown')
    expect(banner()).toHaveTextContent('Retro Films')
    expect(loads).toHaveLength(0)
    plays(1000)
    expect(loads.map((s) => s.id)).toEqual(['films'])
    expect(loads[0]).toMatchObject({ name: 'Retro Films', live: true })
  })

  it('moves through the favorites of the latest star on the computer', async () => {
    await playing()
    act(() => sendContext({ v: 1, type: 'context', favorites: ['news', 'sports'] }))
    press('ArrowDown')
    expect(banner()).toHaveTextContent('Sports Live')
  })

  it('moves through the group the page showed when there are no favorites', async () => {
    await open()
    act(() => senderLoad({ ...SENT, id: 'sports', name: 'Sports Live' }, { ...DATA, id: 'sports', favorites: [], group: 'Fun' }))
    press('ArrowUp')
    expect(banner()).toHaveTextContent('Retro Films')
  })

  it('drops a waiting flip when the computer picks a channel', async () => {
    await playing()
    press('ArrowDown')
    act(() => senderLoad({ ...SENT, id: 'sports', name: 'Sports Live' }, { ...DATA, id: 'sports' }))
    plays(2000)
    expect(loads).toHaveLength(0)
    expect(sent.at(-1)).toMatchObject({ id: 'sports' })
  })
})

describe('the guide', () => {
  it('opens on the playing channel with OK, and watches another with OK', async () => {
    await playing()
    press('Enter')
    expect(highlighted()).toHaveTextContent('News One')
    expect(highlighted()).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Favorites')).toBeInTheDocument()
    press('ArrowDown')
    expect(highlighted()).toHaveTextContent('Retro Films')
    press('Enter')
    expect(guide()).toBeNull()
    expect(loads.map((s) => s.id)).toEqual(['films'])
  })

  it('changes group with Left and Right, and closes with Back', async () => {
    await playing()
    press('Enter')
    press('ArrowRight')
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(3)
    press('BrowserBack')
    expect(guide()).toBeNull()
    expect(leave).not.toHaveBeenCalled()
  })

  it('shows what is on beside it, in place of the big banner', async () => {
    await playing()
    expect(banner()).not.toBeNull()
    press('Enter')
    expect(banner()).toBeNull()
    expect(now()).toHaveTextContent('News One')
    expect(guide()).not.toBeNull()
  })

  it('names the platform above the group', async () => {
    await playing()
    press('Enter')
    expect(screen.getByText('HLS / DASH')).toBeInTheDocument()
  })

  it('closes after 15 s', async () => {
    await playing()
    press('Enter')
    plays(14_500)
    expect(guide()).not.toBeNull()
    plays(1000)
    expect(guide()).toBeNull()
  })

  it('draws only the rows in view of a long group, with the highlighted one among them', async () => {
    const many = Array.from({ length: 2000 }, (_, i) => entry(`s${i}`, `Channel ${i}`))
    await open({ ...LIST, streams: many })
    act(() => senderLoad({ ...SENT, id: 's1500', name: 'Channel 1500' }, { ...DATA, id: 's1500', favorites: [] }))
    press('Enter')
    expect(within(screen.getByRole('listbox')).getAllByRole('option').length).toBeLessThan(40)
    expect(highlighted()).toHaveTextContent('Channel 1500')
    press('ArrowDown')
    expect(highlighted()).toHaveTextContent('Channel 1501')
  })

  it('keeps saying there is no list while a key is held', async () => {
    await open(null)
    act(() => senderLoad(SENT, DATA))
    plays(1000)
    press('ArrowDown')
    for (let i = 0; i < 6; i++) {
      wait(i === 0 ? 400 : 50)
      key('ArrowDown')
      expect(screen.getByText('The channel list is not available right now')).toBeInTheDocument()
    }
  })

  it('stays up, on the same channel, when the list changes under it', async () => {
    await playing()
    press('Enter')
    press('ArrowLeft') // the last group: Fun
    press('ArrowDown')
    expect(highlighted()).toHaveTextContent('Retro Films')
    act(() => sendContext({ v: 1, type: 'context', favorites: [] })) // Favorites goes: one group fewer
    expect(highlighted()).toHaveTextContent('Retro Films')
    press('Enter')
    expect(loads.map((s) => s.id)).toEqual(['films'])
  })

  it('says there is no list, plays on,, and fills on a later try', async () => {
    await open(null)
    act(() => senderLoad(SENT, DATA))
    plays(1000)
    press('Enter')
    expect(guide()).toBeNull()
    expect(screen.getByText('The channel list is not available right now')).toBeInTheDocument()
    await act(async () => {})
    plays(500)
    expect(sent.at(-1)).toMatchObject({ id: 'news', state: 'playing' })
    vi.mocked(refreshStreamSnapshot).mockResolvedValue({ kind: 'ready', snapshot: LIST })
    press('Enter')
    await act(async () => {})
    press('Enter')
    expect(highlighted()).toHaveTextContent('News One')
  })
})

describe('when it does not play', () => {
  const FAILED = 'News One is not available right now. Press Up or Down for another channel.'

  it('says so 20 s after tuning, and it stays', async () => {
    await open()
    act(() => senderLoad(SENT, DATA))
    wait(19_500)
    expect(screen.queryByText(FAILED)).toBeNull()
    wait(750)
    expect(screen.getByText(FAILED)).toBeInTheDocument()
    wait(60_000)
    expect(screen.getByText(FAILED)).toBeInTheDocument()
    expect(sent.at(-1)).toMatchObject({ id: 'news', state: 'failed' })
  })

  it('says so at once on an error, and tunes it again on OK, OK', async () => {
    await playing()
    sample = null
    act(() => engineError())
    expect(screen.getByText(FAILED)).toBeInTheDocument()
    press('Enter')
    press('Enter')
    expect(loads.map((s) => s.id)).toEqual(['news'])
    expect(screen.queryByText(FAILED)).toBeNull()
    expect(banner()).toHaveTextContent('Tuning…')
  })

  it('steps aside for the names of a flip', async () => {
    await playing()
    sample = null
    act(() => engineError())
    press('ArrowDown')
    expect(screen.queryByText(FAILED)).toBeNull()
    expect(banner()).toHaveTextContent('Retro Films')
  })

  it('says when a recording has finished', async () => {
    await playing()
    sample = { time: 60, paused: false, ended: true, stopped: false }
    wait(250)
    expect(screen.getByText('News One has finished. Press Up or Down for another channel.')).toBeInTheDocument()
  })

  it('goes back to the start screen when playing is stopped', async () => {
    await playing()
    sample = { time: 60, paused: false, ended: false, stopped: true }
    wait(250)
    expect(screen.getByText('Pick a stream in PRISM')).toBeInTheDocument()
  })
})

describe('the share card', () => {
  it('its code opens the channel’s page in PRISM', async () => {
    await playing()
    press('ArrowRight')
    const svg = card()?.querySelector('svg')?.outerHTML ?? ''
    const image = new Resvg(svg, { fitTo: { mode: 'width', value: 400 }, background: '#6a7a8a' }).render()
    expect(jsQR(new Uint8ClampedArray(image.pixels), image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data).toBe(shareUrl('news'))
  })

  it('names the country, and shows the picture the computer sent when there is no list', async () => {
    await playing()
    press('ArrowRight')
    expect(card()?.querySelector('img[src*="us"]')).not.toBeNull()
    press('ArrowLeft')
    await open(null)
    act(() => senderLoad({ ...SENT, id: 'abc123def456', logo: 'https://d.test/pic.png' }, { ...DATA, id: 'abc123def456' }))
    plays(1000)
    press('ArrowRight')
    expect(screen.getAllByTestId('tv-card').at(-1)?.querySelector('img[src="https://d.test/pic.png"]')).not.toBeNull()
  })

  it('says a channel that is not working is not working', async () => {
    await playing()
    sample = null
    act(() => engineError())
    press('ArrowRight')
    expect(card()).toHaveTextContent('Not available right now')
  })

  it('Right shows it with the channel’s code, Left takes it away', async () => {
    await playing()
    press('ArrowRight')
    expect(card()).toHaveTextContent('News One')
    expect(card()).toHaveTextContent(SHARE)
    expect(card()?.querySelector('svg')).not.toBeNull()
    expect(banner()).toBeNull()
    press('ArrowLeft')
    expect(card()).toBeNull()
  })

  it('a stream without an id has no code', async () => {
    await open()
    act(() => senderLoad({ ...SENT, id: null, name: 'p.test' }, { ...DATA, id: null }))
    plays(1000)
    press('ArrowRight')
    expect(card()).toHaveTextContent("Only channels from PRISM's list can be shared from the TV")
    expect(card()?.querySelector('svg')).toBeNull()
  })

  it('a channel the TV has no list for still gets its code', async () => {
    await open(null)
    act(() => senderLoad({ ...SENT, id: 'abc123def456', name: 'Mystery Channel' }, { ...DATA, id: 'abc123def456' }))
    plays(1000)
    press('ArrowRight')
    expect(card()).toHaveTextContent('Mystery Channel')
    expect(card()?.querySelector('svg')).not.toBeNull()
  })

  it('asks which style to draw at the start and each time it opens', async () => {
    await playing()
    expect(fetchTvSettings).toHaveBeenCalledTimes(1)
    press('ArrowRight')
    expect(fetchTvSettings).toHaveBeenCalledTimes(2)
  })

  it('goes away after 30 s', async () => {
    await playing()
    press('ArrowRight')
    plays(29_000)
    expect(card()).not.toBeNull()
    plays(1500)
    expect(card()).toBeNull()
  })
})

describe('the clock', () => {
  it('shows only with the guide, the banner or the card', async () => {
    await open()
    expect(clock()).toBeNull()
    act(() => senderLoad(SENT, DATA))
    expect(clock()).not.toBeNull()
    plays(6000)
    expect(banner()).toBeNull()
    expect(clock()).toBeNull()
    press('Enter')
    expect(clock()).not.toBeNull()
    press('BrowserBack')
    press('ArrowRight')
    expect(clock()).not.toBeNull()
  })

  it('is not over a channel that does not play', async () => {
    await playing()
    plays(6000)
    sample = null
    act(() => engineError())
    expect(clock()).toBeNull()
  })
})

describe('the debug line', () => {
  it('follows the player while a channel tunes', async () => {
    report = { engine: 'shaka', step: 'PLAYER_LOADING' }
    await open()
    act(() => senderLoad(SENT, DATA))
    wait(250)
    expect(banner()).toHaveTextContent('PLAYER_LOADING')
    expect(banner()).toHaveTextContent('ch 1/2')
  })

  it('puts the player’s error under a channel that does not play', async () => {
    await playing()
    report = { engine: 'shaka', step: 'ERROR 905' }
    sample = null
    act(() => engineError())
    wait(1000)
    expect(document.querySelector('.tv-message')).toHaveTextContent(/ERROR 905/)
  })

  it('a new channel’s banner never shows the last one’s step', async () => {
    report = { engine: 'shaka', step: 'PLAYING' }
    await playing()
    report = { engine: 'shaka', step: null }
    act(() => senderLoad({ ...SENT, id: 'sports', name: 'Sports Live' }, { ...DATA, id: 'sports' }))
    expect(banner()).not.toHaveTextContent('PLAYING')
  })

  it('a channel tuned on the TV itself never shows the last one’s step either', async () => {
    report = { engine: 'shaka', step: 'PLAYING' }
    await playing()
    press('Enter')
    press('ArrowDown')
    key('Enter') // OK in the guide: tuned here, not by the computer
    expect(banner()).not.toHaveTextContent('PLAYING')
  })

  it('asks the player nothing while none of its words are on screen', async () => {
    await playing()
    plays(6000)
    expect(banner()).toBeNull()
    reportCalls = 0
    plays(5000)
    expect(reportCalls).toBe(0)
    press('ArrowRight') // the share card shows no debug line
    reportCalls = 0
    plays(5000)
    expect(reportCalls).toBe(0)
    press('Enter') // the guide's now card does
    plays(2000)
    expect(reportCalls).toBeGreaterThan(0)
  })
})

describe('the screen', () => {
  it('never shows a stream’s address, in its text or its markup', async () => {
    await playing()
    expect(document.body.innerHTML).not.toMatch(/secret-host|hunter2/)
    press('ArrowRight')
    expect(document.body.innerHTML).not.toMatch(/secret-host|hunter2/)
    press('Enter')
    expect(document.body.innerHTML).not.toMatch(/secret-host|hunter2/)
  })
})

describe('leaving', () => {
  it('asks once and leaves on the second Back', async () => {
    await playing()
    press('BrowserBack')
    expect(screen.getByText('Press Back again to leave')).toBeInTheDocument()
    press('BrowserBack')
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it('keeps asking while Back is held: leaving is still one press away', async () => {
    await playing()
    press('BrowserBack')
    wait(400)
    key('BrowserBack')
    wait(50)
    key('BrowserBack')
    expect(screen.getByText('Press Back again to leave')).toBeInTheDocument()
    expect(leave).not.toHaveBeenCalled()
  })

  it('takes the question away after 3 s', async () => {
    await playing()
    press('BrowserBack')
    plays(3250)
    expect(screen.queryByText('Press Back again to leave')).toBeNull()
  })
})

describe('keys', () => {
  it('are taken from Cast when PRISM uses them, their release too, and left alone otherwise', async () => {
    await playing()
    expect(press('ArrowDown').defaultPrevented).toBe(true)
    expect(key('ArrowDown', 'keyup').defaultPrevented).toBe(true)
    expect(press('MediaPlayPause').defaultPrevented).toBe(false)
    expect(key('MediaPlayPause', 'keyup').defaultPrevented).toBe(false)
  })

  it('are timed by the device, so a busy moment does not turn a held Back into two', async () => {
    await playing()
    const held = (stamp: number) => {
      const event = new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true, cancelable: true })
      Object.defineProperty(event, 'timeStamp', { value: stamp })
      act(() => {
        document.body.dispatchEvent(event)
      })
    }
    const t = performance.now()
    held(t)
    held(t + 400)
    held(t + 450)
    wait(1500) // the page could not look at the keys for a while
    held(t + 500)
    held(t + 550)
    expect(leave).not.toHaveBeenCalled()
  })
})

describe('what it tells PRISM', () => {
  it('is each state once', async () => {
    await playing()
    plays(3000)
    expect(sent.map((m) => m.state)).toEqual(['idle', 'tuning', 'playing'])
    expect(sent.at(-1)).toEqual({ v: 1, type: 'now', id: 'news', name: 'News One', state: 'playing' })
  })
})

it('never shows an address', async () => {
  const { container } = await playing()
  press('Enter')
  press('ArrowRight')
  expect(container.innerHTML).not.toContain('hunter2')
  expect(container.innerHTML).not.toContain('secret-host')
  expect(JSON.stringify(sent)).not.toContain('secret-host')
})
