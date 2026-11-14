import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlaylistScreen from '../PlaylistScreen'
import { AdminSessionContext } from '../AdminSessionContext'
import type { AdminStream } from '../../../lib/adminApi'

const api = vi.hoisted(() => ({
  getStreams: vi.fn(),
  addStream: vi.fn(),
  updateStream: vi.fn(),
  pinStream: vi.fn(),
  setDefaultStream: vi.fn(),
  removeStream: vi.fn(),
}))
vi.mock('../../../lib/adminApi', async (importActual) => ({ ...(await importActual<typeof import('../../../lib/adminApi')>()), ...api }))
// The preview has its own tests; here it only shows that it is open for a stream, and can be closed.
vi.mock('../StreamPreview', () => ({
  default: ({ stream, onClose }: { stream: { publicId: string }; onClose: () => void }) => (
    <div data-testid="preview" data-stream={stream.publicId}>
      <button type="button" onClick={onClose}>
        Close preview
      </button>
    </div>
  ),
}))

const LIMITS = { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 }
const onExpired = vi.fn()

function stream(over: Partial<AdminStream> = {}): AdminStream {
  return {
    publicId: '0123456789ab',
    name: 'Alpha News',
    url: 'https://secret-host.test:8443/live/path.m3u8?x=1',
    groups: ['News', 'Sports'],
    country: 'us',
    kind: 'hls',
    state: 'new',
    stateReason: null,
    pinned: false,
    isDefault: false,
    source: 'hls-valid-2026-11',
    hasLogo: false,
    addedAt: '2026-11-14 03:00:00',
    ...over,
  }
}

const ALPHA = stream()
const BETA = stream({ publicId: 'ba9876543210', name: 'Beta Sports', url: 'http://beta.test/x.m3u8', groups: ['Sports'], country: null, state: 'unplayable', stateReason: 'http', source: 'manual' })
const GAMMA = stream({ publicId: 'cccccccccccc', name: 'Gamma', state: 'working', pinned: true, isDefault: true, country: 'gb' })
const DELTA = stream({ publicId: 'dddddddddddd', name: 'Delta', state: 'held', stateReason: 'port' })
const EPSILON = stream({ publicId: 'eeeeeeeeeeee', name: 'Epsilon', state: 'removed' })

const page = (streams: AdminStream[] = [ALPHA, BETA], extra: Record<string, unknown> = {}) => ({
  kind: 'ok',
  data: { streams, total: streams.length, counts: { new: 1, unplayable: 1 }, limit: 50, offset: 0, ...extra },
})
const done = (data: { publicId?: string | null; snapshot?: boolean; state?: string | null; stateReason?: string | null } = {}) => ({
  kind: 'ok',
  data: { publicId: null, state: null, stateReason: null, snapshot: true, ...data },
})

function renderScreen() {
  return render(
    <AdminSessionContext.Provider value={{ limits: LIMITS, onExpired }}>
      <PlaylistScreen />
    </AdminSessionContext.Provider>,
  )
}

const table = () => screen.findByRole('table', { name: 'Playlist streams' })
const row = async (name: string) => within(await table()).getByRole('row', { name: new RegExp(name) })

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  onExpired.mockReset()
  api.getStreams.mockResolvedValue(page())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PlaylistScreen: reading', () => {
  it('says it is loading before the first answer, and asks for the first page with no filter', () => {
    api.getStreams.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(api.getStreams).toHaveBeenCalledWith({ text: '', state: '', country: '' }, { limit: 50, offset: 0 }, expect.anything())
  })

  it('lists each stream with its state, country, groups and source, and shows only the host of its address', async () => {
    renderScreen()

    const alpha = await row('Alpha News')
    expect(alpha).toHaveTextContent('new')
    expect(alpha).toHaveTextContent('United States')
    expect(alpha).toHaveTextContent('News, Sports')
    expect(alpha).toHaveTextContent('hls-valid-2026-11')
    expect(alpha).toHaveTextContent('secret-host.test:8443')
    expect(alpha.innerHTML).not.toContain('path.m3u8')
    const beta = await row('Beta Sports')
    expect(beta).toHaveTextContent('unplayable (http)')
    expect(beta).toHaveTextContent('manual')
  })

  it('summarises how many streams are in each state', async () => {
    api.getStreams.mockResolvedValue(page([ALPHA], { total: 5164, counts: { new: 3507, working: 5, held: 483, unplayable: 1169 } }))

    renderScreen()

    const summary = await screen.findByRole('list', { name: 'Streams by state' })
    expect(summary).toHaveTextContent('new 3,507')
    expect(summary).toHaveTextContent('held 483')
    expect(summary).toHaveTextContent('unplayable 1,169')
    expect(screen.getByText(/of 5,164 streams/)).toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    api.getStreams.mockResolvedValue(page([], { total: 0, counts: {} }))

    renderScreen()

    expect(await screen.findByText('No streams match.')).toBeInTheDocument()
  })

  it('shows an error with a way to try again', async () => {
    api.getStreams.mockResolvedValueOnce({ kind: 'unavailable' })
    renderScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the playlist')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))

    expect(await table()).toBeInTheDocument()
    expect(api.getStreams).toHaveBeenCalledTimes(2)
  })

  it('ends the admin session when the server says the token is no longer good', async () => {
    api.getStreams.mockResolvedValue({ kind: 'signed_out' })

    renderScreen()

    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1))
  })

  it('shows markup in a name or a group as text and creates no element from it', async () => {
    const evil = '<img src=x onerror=alert(1)>'
    api.getStreams.mockResolvedValue(page([stream({ name: evil, groups: [evil] })]))

    const { container } = renderScreen()

    expect((await table()).textContent).toContain(evil)
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })

  it('has no buttons on a removed stream, which is only a tombstone', async () => {
    api.getStreams.mockResolvedValue(page([EPSILON]))

    renderScreen()

    const epsilon = await row('Epsilon')
    expect(epsilon).toHaveTextContent('removed')
    expect(within(epsilon).queryAllByRole('button')).toHaveLength(0)
  })
})

describe('PlaylistScreen: filters and pages', () => {
  it('sends one debounced request for the search text, and one for each of the state and the country', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderScreen()
    await table()
    api.getStreams.mockClear()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search streams' }), { target: { value: 'be' } })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search streams' }), { target: { value: 'beta' } })
    expect(api.getStreams).not.toHaveBeenCalled()
    await act(async () => void vi.advanceTimersByTime(300))
    expect(api.getStreams).toHaveBeenCalledTimes(1)
    expect(api.getStreams).toHaveBeenLastCalledWith({ text: 'beta', state: '', country: '' }, { limit: 50, offset: 0 }, expect.anything())

    fireEvent.change(screen.getByRole('combobox', { name: 'State' }), { target: { value: 'held' } })
    expect(api.getStreams).toHaveBeenLastCalledWith({ text: 'beta', state: 'held', country: '' }, { limit: 50, offset: 0 }, expect.anything())

    fireEvent.change(screen.getByRole('textbox', { name: 'Country' }), { target: { value: 'GB1' } })
    expect((screen.getByRole('textbox', { name: 'Country' }) as HTMLInputElement).value).toBe('gb')
    expect(api.getStreams).toHaveBeenLastCalledWith({ text: 'beta', state: 'held', country: 'gb' }, { limit: 50, offset: 0 }, expect.anything())
  })

  it('asks for a country only once it has two letters, so typing one letter never makes the server answer an error', async () => {
    renderScreen()
    await table()
    api.getStreams.mockClear()
    const country = screen.getByRole('textbox', { name: 'Country' })

    fireEvent.change(country, { target: { value: 'g' } })
    expect(api.getStreams).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(await table()).toBeInTheDocument()

    fireEvent.change(country, { target: { value: 'gb' } })
    expect(api.getStreams).toHaveBeenLastCalledWith({ text: '', state: '', country: 'gb' }, { limit: 50, offset: 0 }, expect.anything())

    fireEvent.change(country, { target: { value: 'g' } })
    expect(api.getStreams).toHaveBeenLastCalledWith({ text: '', state: '', country: '' }, { limit: 50, offset: 0 }, expect.anything())
    expect(api.getStreams).not.toHaveBeenCalledWith(expect.objectContaining({ country: 'g' }), expect.anything(), expect.anything())
    expect((country as HTMLInputElement).value).toBe('g')
  })

  it('offers every state to filter by', async () => {
    renderScreen()
    await table()

    const options = within(screen.getByRole('combobox', { name: 'State' })).getAllByRole('option').map((o) => o.textContent)

    expect(options).toEqual(['All states', 'new', 'working', 'suspect', 'dead', 'removed', 'unplayable', 'held'])
  })

  it('pages through a long list and goes back to the first page when a filter changes', async () => {
    const user = userEvent.setup()
    api.getStreams.mockResolvedValue(page([ALPHA], { total: 120 }))
    renderScreen()
    await table()
    expect(screen.getByText(/Showing 1–1 of 120 streams/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(api.getStreams).toHaveBeenLastCalledWith({ text: '', state: '', country: '' }, { limit: 50, offset: 50 }, expect.anything())
    api.getStreams.mockResolvedValue(page([BETA], { total: 120, offset: 50 }))
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(api.getStreams).toHaveBeenLastCalledWith({ text: '', state: '', country: '' }, { limit: 50, offset: 100 }, expect.anything())
    await screen.findByText(/Showing 101–101 of 120 streams/)
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

    fireEvent.change(screen.getByRole('combobox', { name: 'State' }), { target: { value: 'new' } })
    expect(api.getStreams).toHaveBeenLastCalledWith({ text: '', state: 'new', country: '' }, { limit: 50, offset: 0 }, expect.anything())
  })
})

describe('PlaylistScreen: adding a stream', () => {
  async function fill(address: string, name: string, group = '') {
    const user = userEvent.setup()
    await table()
    await user.type(screen.getByRole('textbox', { name: 'Stream address' }), address)
    await user.type(screen.getByRole('textbox', { name: 'Stream name' }), name)
    if (group) await user.type(screen.getByRole('textbox', { name: 'Group' }), group)
    return user
  }

  it('sends the address, name and group once, clears the form and reloads the list', async () => {
    api.addStream.mockResolvedValue(done({ publicId: 'ffffffffffff' }))
    renderScreen()
    const user = await fill('https://new.test/x.m3u8', 'New one', 'News; Sports')
    api.getStreams.mockClear()

    await user.dblClick(screen.getByRole('button', { name: 'Add stream' }))

    expect(api.addStream).toHaveBeenCalledTimes(1)
    expect(api.addStream).toHaveBeenCalledWith({ url: 'https://new.test/x.m3u8', name: 'New one', group: 'News; Sports' }, expect.anything())
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('Added “New one”')
    expect((screen.getByRole('textbox', { name: 'Stream address' }) as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('textbox', { name: 'Stream name' }) as HTMLInputElement).value).toBe('')
    expect(api.getStreams).toHaveBeenCalled()
  })

  it('says plainly when an added stream is hidden from visitors, and why', async () => {
    const user = userEvent.setup()
    renderScreen()
    await table()
    const send = async (address: string) => {
      await user.clear(screen.getByRole('textbox', { name: 'Stream address' }))
      await user.type(screen.getByRole('textbox', { name: 'Stream address' }), address)
      await user.clear(screen.getByRole('textbox', { name: 'Stream name' }))
      await user.type(screen.getByRole('textbox', { name: 'Stream name' }), 'My Channel')
      await user.click(screen.getByRole('button', { name: 'Add stream' }))
    }

    api.addStream.mockResolvedValueOnce(done({ publicId: 'ffffffffffff', state: 'unplayable', stateReason: 'http' }))
    await send('http://example.tv/live.m3u8')
    const http = await screen.findByRole('status')
    expect(http).toHaveTextContent('Added “My Channel”')
    expect(http).toHaveTextContent(/visitors will not see it/i)
    expect(http).toHaveTextContent(/http:\/\//)

    api.addStream.mockResolvedValueOnce(done({ publicId: 'ffffffffffff', state: 'held', stateReason: 'port' }))
    await send('https://example.tv:8443/live.m3u8')
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/unusual port/i))
    expect(screen.getByRole('status')).toHaveTextContent(/visitors will not see it/i)

    api.addStream.mockResolvedValueOnce(done({ publicId: 'ffffffffffff', state: 'new', stateReason: null }))
    await send('https://example.tv/live.m3u8')
    await vi.waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent(/will not see/i))
    expect(screen.getByRole('status')).toHaveTextContent('Added “My Channel”.')
  })

  it('cannot be sent until there is an address and a name', async () => {
    renderScreen()
    await table()

    expect(screen.getByRole('button', { name: 'Add stream' })).toBeDisabled()
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Stream address' }), 'https://new.test/x')
    expect(screen.getByRole('button', { name: 'Add stream' })).toBeDisabled()
  })

  it.each([
    ['credentials', /login/i],
    ['token', /token/i],
    ['bad_address', /not a usable http or https address/i],
    ['adult', /adult/i],
    ['bad_name', /1 to 200 characters/i],
    ['id_clash', /collides/i],
    ['something_new', /something_new/],
  ])('shows why the server refused it: %s', async (reason, text) => {
    api.addStream.mockResolvedValue({ kind: 'rejected', reason })
    renderScreen()
    const user = await fill('https://new.test/x.m3u8', 'New one')

    await user.click(screen.getByRole('button', { name: 'Add stream' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect((screen.getByRole('textbox', { name: 'Stream address' }) as HTMLInputElement).value).toBe('https://new.test/x.m3u8')
  })

  it('says so when the address is already in the list', async () => {
    api.addStream.mockResolvedValue({ kind: 'already_known', publicId: '0123456789ab' })
    renderScreen()
    const user = await fill('https://new.test/x.m3u8', 'New one')

    await user.click(screen.getByRole('button', { name: 'Add stream' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already in the list/i)
  })

  it('says nothing was added when the server does not answer, and ends the session when it says signed out', async () => {
    api.addStream.mockResolvedValueOnce({ kind: 'unavailable' })
    renderScreen()
    const user = await fill('https://new.test/x.m3u8', 'New one')

    await user.click(screen.getByRole('button', { name: 'Add stream' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not work/i)

    api.addStream.mockResolvedValueOnce({ kind: 'signed_out' })
    await user.click(screen.getByRole('button', { name: 'Add stream' }))
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1))
  })

  it('warns when the stream was saved but the visitor list could not be refreshed', async () => {
    api.addStream.mockResolvedValue(done({ snapshot: false }))
    renderScreen()
    const user = await fill('https://new.test/x.m3u8', 'New one')

    await user.click(screen.getByRole('button', { name: 'Add stream' }))

    expect(await screen.findByText(/visitor list could not be refreshed/i)).toBeInTheDocument()
  })
})

describe('PlaylistScreen: editing, pinning, default and removing', () => {
  it('edits a name and its groups in the row, sending the groups as a list', async () => {
    const user = userEvent.setup()
    api.updateStream.mockResolvedValue(done())
    renderScreen()
    await row('Alpha News')

    await user.click(screen.getByRole('button', { name: 'Edit Alpha News' }))
    const name = screen.getByRole('textbox', { name: 'Name of Alpha News' }) as HTMLInputElement
    const groups = screen.getByRole('textbox', { name: 'Groups of Alpha News' }) as HTMLInputElement
    expect([name.value, groups.value]).toEqual(['Alpha News', 'News; Sports'])
    await user.clear(name)
    await user.type(name, 'Alpha 2')
    await user.clear(groups)
    await user.type(groups, ' Music ;News;; ')
    await user.click(screen.getByRole('button', { name: 'Save Alpha News' }))

    expect(api.updateStream).toHaveBeenCalledWith('0123456789ab', { name: 'Alpha 2', groups: ['Music', 'News'] }, expect.anything())
    await vi.waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name of Alpha News' })).toBeNull())
  })

  it('cancels an edit without sending anything, and shows why a bad edit was refused', async () => {
    const user = userEvent.setup()
    renderScreen()
    await row('Alpha News')
    await user.click(screen.getByRole('button', { name: 'Edit Alpha News' }))
    await user.click(screen.getByRole('button', { name: 'Cancel editing Alpha News' }))
    expect(api.updateStream).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Name of Alpha News' })).toBeNull()

    api.updateStream.mockResolvedValue({ kind: 'rejected', reason: 'adult' })
    await user.click(screen.getByRole('button', { name: 'Edit Alpha News' }))
    await user.click(screen.getByRole('button', { name: 'Save Alpha News' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/adult/i)
    expect(screen.getByRole('textbox', { name: 'Name of Alpha News' })).toBeInTheDocument()
  })

  it('pins and unpins, one request each, and reloads', async () => {
    const user = userEvent.setup()
    api.pinStream.mockResolvedValue(done())
    api.getStreams.mockResolvedValue(page([ALPHA, GAMMA]))
    renderScreen()
    await row('Alpha News')
    api.getStreams.mockClear()

    await user.click(screen.getByRole('button', { name: 'Pin Alpha News' }))
    expect(api.pinStream).toHaveBeenLastCalledWith('0123456789ab', true, expect.anything())
    await user.click(screen.getByRole('button', { name: 'Unpin Gamma' }))

    expect(api.pinStream).toHaveBeenLastCalledWith('cccccccccccc', false, expect.anything())
    expect(api.getStreams).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Unpin Gamma' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Pin Alpha News' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('makes a stream the default, only for one visitors can see, and marks the current default', async () => {
    const user = userEvent.setup()
    api.setDefaultStream.mockResolvedValue(done())
    api.getStreams.mockResolvedValue(page([ALPHA, BETA, GAMMA, DELTA]))
    renderScreen()
    await row('Alpha News')

    expect(screen.getByRole('button', { name: 'Make Beta Sports the default' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Make Delta the default' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Make Gamma the default' })).toBeNull()
    expect(await row('Gamma')).toHaveTextContent('Default')

    await user.click(screen.getByRole('button', { name: 'Make Alpha News the default' }))

    expect(api.setDefaultStream).toHaveBeenCalledWith('0123456789ab', expect.anything())
  })

  it('asks before removing, and cancelling sends nothing', async () => {
    const user = userEvent.setup()
    renderScreen()
    await row('Alpha News')

    await user.click(screen.getByRole('button', { name: 'Remove Alpha News' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Remove Alpha News?')
    expect(dialog).toHaveTextContent(/cannot be undone here/i)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(api.removeStream).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('removes once however fast it is clicked, then reloads', async () => {
    const user = userEvent.setup()
    api.removeStream.mockResolvedValue(done())
    renderScreen()
    await row('Alpha News')
    await user.click(screen.getByRole('button', { name: 'Remove Alpha News' }))
    api.getStreams.mockClear()

    await user.dblClick(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove stream' }))

    expect(api.removeStream).toHaveBeenCalledTimes(1)
    expect(api.removeStream).toHaveBeenCalledWith('0123456789ab', expect.anything())
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.getStreams).toHaveBeenCalled()
  })

  it('says a stream is already gone when the server cannot find it', async () => {
    const user = userEvent.setup()
    api.removeStream.mockResolvedValue({ kind: 'not_found' })
    renderScreen()
    await row('Alpha News')
    await user.click(screen.getByRole('button', { name: 'Remove Alpha News' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove stream' }))

    expect(await screen.findByText('That stream is already gone.')).toBeInTheDocument()
  })

  it('refuses a default the server says visitors cannot see, and says nothing changed when it does not answer', async () => {
    const user = userEvent.setup()
    api.setDefaultStream.mockResolvedValueOnce({ kind: 'not_listed' })
    renderScreen()
    await row('Alpha News')

    await user.click(screen.getByRole('button', { name: 'Make Alpha News the default' }))
    expect(await screen.findByText(/visitors cannot see/i)).toBeInTheDocument()

    api.pinStream.mockResolvedValueOnce({ kind: 'unavailable' })
    await user.click(screen.getByRole('button', { name: 'Pin Alpha News' }))
    expect(await screen.findByText(/did not work\. Nothing was changed/i)).toBeInTheDocument()
  })

  it('disables every action while one request is in flight', async () => {
    const user = userEvent.setup()
    let finish: (value: unknown) => void = () => {}
    api.pinStream.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderScreen()
    await row('Alpha News')

    await user.click(screen.getByRole('button', { name: 'Pin Alpha News' }))

    expect(screen.getByRole('button', { name: 'Pin Alpha News' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit Alpha News' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove Alpha News' })).toBeDisabled()
    await act(async () => finish(done()))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Edit Alpha News' })).toBeEnabled())
  })

  it('ends the admin session when an action says signed out', async () => {
    api.removeStream.mockResolvedValue({ kind: 'signed_out' })
    const user = userEvent.setup()
    renderScreen()
    await row('Alpha News')
    await user.click(screen.getByRole('button', { name: 'Remove Alpha News' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove stream' }))

    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1))
  })
})

describe('PlaylistScreen: playing a stream in place', () => {
  const previews = () => screen.queryAllByTestId('preview')
  const play = (name: string) => screen.getByRole('button', { name: `Play ${name}` })

  it('opens the preview in a row under the stream, moves it to another stream, and closes it', async () => {
    const user = userEvent.setup()
    renderScreen()
    await row('Alpha News')

    await user.click(play('Alpha News'))
    expect(previews()).toHaveLength(1)
    expect(previews()[0]).toHaveAttribute('data-stream', '0123456789ab')
    expect(previews()[0].closest('tr')?.previousElementSibling).toHaveTextContent('Alpha News')

    await user.click(play('Beta Sports'))
    expect(previews()).toHaveLength(1)
    expect(previews()[0]).toHaveAttribute('data-stream', 'ba9876543210')
    expect(previews()[0].closest('tr')?.previousElementSibling).toHaveTextContent('Beta Sports')

    await user.click(screen.getByRole('button', { name: 'Close preview' }))
    expect(previews()).toHaveLength(0)
  })

  it('closes the preview when Play is pressed again on the open stream, and says which stream is open', async () => {
    const user = userEvent.setup()
    renderScreen()
    await row('Alpha News')

    expect(play('Alpha News')).toHaveAttribute('aria-expanded', 'false')
    await user.click(play('Alpha News'))
    expect(play('Alpha News')).toHaveAttribute('aria-expanded', 'true')
    expect(play('Beta Sports')).toHaveAttribute('aria-expanded', 'false')
    await user.click(play('Alpha News'))

    expect(previews()).toHaveLength(0)
    expect(play('Alpha News')).toHaveAttribute('aria-expanded', 'false')
  })

  it('offers Play on every stream that is not removed, whatever its other state', async () => {
    api.getStreams.mockResolvedValue(page([ALPHA, BETA, GAMMA, DELTA, EPSILON]))
    renderScreen()
    await row('Alpha News')

    for (const name of ['Alpha News', 'Beta Sports', 'Gamma', 'Delta']) expect(play(name)).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Play Epsilon' })).toBeNull()
  })

  it('closes on a change of page, even when the same stream is on the next page', async () => {
    const user = userEvent.setup()
    api.getStreams.mockResolvedValue(page([ALPHA], { total: 120 }))
    renderScreen()
    await row('Alpha News')
    await user.click(play('Alpha News'))
    api.getStreams.mockResolvedValue(page([ALPHA], { total: 120, offset: 50 }))

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(previews()).toHaveLength(0)

    await screen.findByText(/Showing 51–51 of 120 streams/)
    expect(previews()).toHaveLength(0)
  })

  it('closes on a change of filter, even when the stream still matches', async () => {
    const user = userEvent.setup()
    renderScreen()
    await row('Alpha News')
    await user.click(play('Alpha News'))

    fireEvent.change(screen.getByRole('combobox', { name: 'State' }), { target: { value: 'new' } })

    expect(previews()).toHaveLength(0)
    await row('Alpha News')
    expect(previews()).toHaveLength(0)
  })

  it('closes the preview of a stream that is being edited, and leaves another stream’s alone', async () => {
    const user = userEvent.setup()
    renderScreen()
    await row('Alpha News')
    await user.click(play('Alpha News'))

    await user.click(screen.getByRole('button', { name: 'Edit Beta Sports' }))
    expect(previews()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Edit Alpha News' }))
    expect(previews()).toHaveLength(0)
  })

  it('closes the preview of a stream once it is removed, and keeps it when the removal is cancelled', async () => {
    const user = userEvent.setup()
    api.removeStream.mockResolvedValue(done())
    renderScreen()
    await row('Alpha News')
    await user.click(play('Alpha News'))

    await user.click(screen.getByRole('button', { name: 'Remove Alpha News' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(previews()).toHaveLength(1)

    // The list still holds the stream afterwards, now as a tombstone.
    api.getStreams.mockResolvedValue(page([{ ...ALPHA, state: 'removed' }, BETA]))
    await user.click(screen.getByRole('button', { name: 'Remove Alpha News' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove stream' }))

    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Play Alpha News' })).toBeNull())
    expect(previews()).toHaveLength(0)
  })

  it('keeps the preview through a reload that still lists the stream, and closes it when a reload does not', async () => {
    const user = userEvent.setup()
    api.pinStream.mockResolvedValue(done())
    renderScreen()
    await row('Alpha News')
    await user.click(play('Alpha News'))

    await user.click(screen.getByRole('button', { name: 'Pin Beta Sports' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Pin Beta Sports' })).toBeEnabled())
    expect(previews()).toHaveLength(1)

    api.getStreams.mockResolvedValue(page([BETA]))
    await user.click(screen.getByRole('button', { name: 'Pin Beta Sports' }))

    await vi.waitFor(() => expect(previews()).toHaveLength(0))
  })
})
