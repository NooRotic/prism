import { createFakeFloatingWindow, createFakeTwitch } from '../../test/fakeFloatingWindow'
import {
  PLAYER_HOLDER_ID,
  READY_TIMEOUT_MS,
  RESIZE_DEBOUNCE_MS,
  START_BUTTON_TEXT,
  openFloatingWindow,
} from '../floatingWindow'
import type { OpenFloatingOptions } from '../floatingWindow'

function setup(twitchOptions?: Parameters<typeof createFakeTwitch>[0]) {
  const fake = createFakeFloatingWindow()
  const twitch = createFakeTwitch(twitchOptions)
  const callbacks = { onClosed: vi.fn(), onFailed: vi.fn(), onResize: vi.fn() }
  const opener = vi.fn().mockResolvedValue(fake.win)
  const options: OpenFloatingOptions = {
    channel: 'streamer',
    parent: 'prism.example',
    size: { width: 640, height: 360 },
    ...callbacks,
    opener,
    loadScript: twitch.loadScript,
  }
  return { fake, twitch, callbacks, opener, options }
}

function startButton(win: Window): HTMLButtonElement {
  const button = win.document.querySelector('button')
  if (!button) throw new Error('the start button is not in the window')
  return button
}

/** Lets the promise chains behind a click settle, without touching timers. */
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

async function openAndStart(twitchOptions?: Parameters<typeof createFakeTwitch>[0]) {
  const context = setup(twitchOptions)
  const session = await openFloatingWindow(context.options)
  startButton(context.fake.win).click()
  await flush()
  return { ...context, session }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('openFloatingWindow: opening', () => {
  it('asks the browser for the window synchronously, with the size it was given', async () => {
    const { options, opener } = setup()
    const pending = openFloatingWindow(options)
    // Before awaiting anything: the browser only allows the request inside the click.
    expect(opener).toHaveBeenCalledWith({ width: 640, height: 360 })
    await pending
  })

  it("rejects with the browser's error and touches nothing else", async () => {
    const { options, callbacks, twitch } = setup()
    options.opener = vi.fn().mockRejectedValue(new Error('no activation'))

    await expect(openFloatingWindow(options)).rejects.toThrow('no activation')

    expect(callbacks.onClosed).not.toHaveBeenCalled()
    expect(callbacks.onFailed).not.toHaveBeenCalled()
    expect(twitch.loadScript).not.toHaveBeenCalled()
  })

  it('shows only the start screen at first', async () => {
    const { options, fake, twitch } = setup()
    await openFloatingWindow(options)

    expect(fake.win.document.getElementById(PLAYER_HOLDER_ID)).not.toBeNull()
    expect(startButton(fake.win).textContent).toBe(START_BUTTON_TEXT)
    expect(twitch.loadScript).not.toHaveBeenCalled()
    expect(twitch.instances).toHaveLength(0)
  })
})

describe('openFloatingWindow: starting the player', () => {
  it('builds the player inside the window, with sound, when the button is clicked', async () => {
    const { fake, twitch } = await openAndStart()

    expect(twitch.loadScript).toHaveBeenCalledWith(fake.win)
    expect(twitch.instances).toHaveLength(1)
    expect(twitch.instances[0].id).toBe('prism-floating-player')
    expect(twitch.instances[0].options).toMatchObject({
      channel: 'streamer',
      parent: ['prism.example'],
      autoplay: true,
      muted: false,
    })
    expect(fake.win.document.querySelector('button')).toBeNull()
  })

  it('starts the latest channel when the channel changed before the click', async () => {
    const { options, fake, twitch } = setup()
    const session = await openFloatingWindow(options)

    session.setChannel('other')
    startButton(fake.win).click()
    await flush()

    expect(twitch.instances[0].options.channel).toBe('other')
  })

  it('reports a failure when the Twitch script cannot load', async () => {
    const { options, fake, twitch, callbacks } = setup()
    twitch.loadScript.mockRejectedValueOnce(new Error('blocked'))
    await openFloatingWindow(options)

    startButton(fake.win).click()
    await flush()

    expect(callbacks.onFailed).toHaveBeenCalledOnce()
    expect(callbacks.onClosed).not.toHaveBeenCalled()
  })

  it('reports a failure when the embed cannot be constructed', async () => {
    const { options, fake, callbacks } = setup()
    class Broken {
      constructor() {
        throw new Error('boom')
      }
    }
    options.loadScript = async (win) => {
      ;(win as unknown as { Twitch?: unknown }).Twitch = { Embed: Broken }
    }
    await openFloatingWindow(options)

    startButton(fake.win).click()
    await flush()

    expect(callbacks.onFailed).toHaveBeenCalledOnce()
  })

  it('reports a failure when the player never becomes ready', async () => {
    vi.useFakeTimers()
    const { callbacks } = await openAndStart()

    vi.advanceTimersByTime(READY_TIMEOUT_MS)

    expect(callbacks.onFailed).toHaveBeenCalledOnce()
  })

  it('does not report a failure once the player is ready', async () => {
    vi.useFakeTimers()
    const { callbacks, twitch } = await openAndStart()

    twitch.instances[0].fire(twitch.Embed.VIDEO_READY)
    vi.advanceTimersByTime(READY_TIMEOUT_MS * 2)

    expect(callbacks.onFailed).not.toHaveBeenCalled()
  })
})

describe('openFloatingWindow: changing channel', () => {
  it('switches with setChannel once playing, without rebuilding the player', async () => {
    const { session, twitch } = await openAndStart()

    session.setChannel('other')
    session.setChannel('other')

    expect(twitch.instances).toHaveLength(1)
    expect(twitch.instances[0].player.setChannel).toHaveBeenCalledTimes(1)
    expect(twitch.instances[0].player.setChannel).toHaveBeenCalledWith('other')
  })

  it('rebuilds the player when the player has no setChannel', async () => {
    const { session, twitch } = await openAndStart({ playerHasSetChannel: false })

    session.setChannel('other')

    expect(twitch.instances).toHaveLength(2)
    expect(twitch.instances[1].options.channel).toBe('other')
    expect(twitch.instances[0].destroy).toHaveBeenCalled()
  })

  it('does nothing after the window has closed', async () => {
    const { session, twitch } = await openAndStart()
    session.close()

    session.setChannel('other')

    expect(twitch.instances).toHaveLength(1)
    expect(twitch.instances[0].player.setChannel).not.toHaveBeenCalled()
  })
})

describe('openFloatingWindow: the window going away and resizing', () => {
  it('tells the caller once when the window goes away, however it closed', async () => {
    const { options, fake, callbacks } = setup()
    const session = await openFloatingWindow(options)

    fake.emit('pagehide')
    fake.emit('pagehide')

    expect(callbacks.onClosed).toHaveBeenCalledOnce()
    expect(session.closed).toBe(true)
  })

  it('close() closes the window once, however often it is called', async () => {
    const { options, fake, callbacks } = setup()
    const session = await openFloatingWindow(options)

    session.close()
    session.close()

    expect(fake.win.close).toHaveBeenCalledTimes(1)
    expect(callbacks.onClosed).toHaveBeenCalledOnce()
  })

  it('reports the size only after a resize has settled', async () => {
    vi.useFakeTimers()
    const { options, fake, callbacks } = setup()
    await openFloatingWindow(options)

    fake.setSize(700, 400)
    fake.emit('resize')
    fake.emit('resize')
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS - 1)
    expect(callbacks.onResize).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(callbacks.onResize).toHaveBeenCalledOnce()
    expect(callbacks.onResize).toHaveBeenCalledWith({ width: 700, height: 400 })
  })
})
