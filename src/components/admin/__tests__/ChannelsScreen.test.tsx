import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChannelsScreen from '../ChannelsScreen'
import { AdminSessionContext } from '../AdminSessionContext'

const api = vi.hoisted(() => ({ getChannels: vi.fn(), removeChannel: vi.fn(), unblockChannel: vi.fn() }))
vi.mock('../../../lib/adminApi', () => ({ getChannels: api.getChannels, removeChannel: api.removeChannel, unblockChannel: api.unblockChannel }))

const LIMITS = { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 }
const alice = { twitchId: '1', login: 'alice', displayName: 'Alice', status: 'tracking', trackedSince: '2026-11-12', lastVisitedAt: '2026-11-12 03:00:00', ttStatus: 'ok' }
const bob = { twitchId: '2', login: 'bob', displayName: 'The Builder', status: 'gone', trackedSince: '2026-11-01', lastVisitedAt: '2026-11-02 03:00:00', ttStatus: null }
const banned = { twitchId: '9', login: 'banned', blockedAt: '2026-11-12 03:00:00' }
const data = (channels = [alice, bob], blocked = [banned]) => ({ kind: 'ok', data: { channels, blocked } })

const onExpired = vi.fn()

function renderScreen() {
  return render(
    <AdminSessionContext.Provider value={{ limits: LIMITS, onExpired }}>
      <ChannelsScreen />
    </AdminSessionContext.Provider>,
  )
}

describe('ChannelsScreen', () => {
  beforeEach(() => {
    api.getChannels.mockReset()
    api.removeChannel.mockReset()
    api.unblockChannel.mockReset()
    onExpired.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says it is loading before the first answer', () => {
    api.getChannels.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(api.getChannels).toHaveBeenCalledWith('', expect.anything())
  })

  it('lists the channels with their status, dates and latest TwitchTracker status, and the blocked ones', async () => {
    api.getChannels.mockResolvedValue(data())

    renderScreen()

    const table = await screen.findByRole('table', { name: 'Tracked channels' })
    const row = within(table).getByRole('row', { name: /alice/ })
    expect(row).toHaveTextContent('Alice')
    expect(row).toHaveTextContent('tracking')
    expect(row).toHaveTextContent('2026-11-12')
    expect(row).toHaveTextContent('2026-11-12 03:00 UTC')
    expect(row).toHaveTextContent('ok')
    expect(within(table).getByRole('row', { name: /bob/ })).toHaveTextContent('gone')
    const blocked = screen.getByRole('table', { name: 'Blocked channels' })
    expect(within(blocked).getByRole('row', { name: /banned/ })).toBeInTheDocument()
    expect(within(blocked).getByRole('button', { name: 'Unblock banned' })).toBeInTheDocument()
  })

  it('says so when no channel matches, and when nothing is blocked', async () => {
    api.getChannels.mockResolvedValue(data([], []))

    renderScreen()

    expect(await screen.findByText('No channels match.')).toBeInTheDocument()
    expect(screen.getByText('Nothing is blocked.')).toBeInTheDocument()
  })

  it('sends one debounced request with the search text', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.getChannels.mockResolvedValue(data())
    renderScreen()
    await screen.findByRole('table', { name: 'Tracked channels' })
    api.getChannels.mockClear()

    const box = screen.getByRole('searchbox', { name: 'Search channels' })
    await userEvent.type(box, 'ali')
    expect(api.getChannels).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })

    expect(api.getChannels).toHaveBeenCalledTimes(1)
    expect(api.getChannels).toHaveBeenCalledWith('ali', expect.anything())
  })

  it('removes after a confirm that says it cannot be undone, once, and reloads the list', async () => {
    api.getChannels.mockResolvedValue(data())
    api.removeChannel.mockResolvedValue({ kind: 'ok', data: { ok: true } })
    renderScreen()
    const table = await screen.findByRole('table', { name: 'Tracked channels' })

    await userEvent.click(within(table).getByRole('button', { name: 'Remove and block alice' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('cannot be undone')
    expect(dialog).toHaveTextContent('alice')
    expect(api.removeChannel).not.toHaveBeenCalled()

    api.getChannels.mockResolvedValue(data([bob], [banned, { twitchId: '1', login: 'alice', blockedAt: '2026-11-12 04:00:00' }]))
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Remove and block' }))

    expect(api.removeChannel).toHaveBeenCalledTimes(1)
    expect(api.removeChannel).toHaveBeenCalledWith('1', expect.anything())
    await vi.waitFor(() =>
      expect(within(screen.getByRole('table', { name: 'Blocked channels' })).getByRole('row', { name: /alice/ })).toBeInTheDocument(),
    )
    expect(within(screen.getByRole('table', { name: 'Tracked channels' })).queryByRole('row', { name: /alice/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.getChannels).toHaveBeenCalledTimes(2)
  })

  it('does nothing when the confirm is cancelled', async () => {
    api.getChannels.mockResolvedValue(data())
    renderScreen()
    const table = await screen.findByRole('table', { name: 'Tracked channels' })

    await userEvent.click(within(table).getByRole('button', { name: 'Remove and block alice' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.removeChannel).not.toHaveBeenCalled()
  })

  it('says "already gone" when the server no longer has the channel, and reloads', async () => {
    api.getChannels.mockResolvedValue(data())
    api.removeChannel.mockResolvedValue({ kind: 'not_found' })
    renderScreen()
    const table = await screen.findByRole('table', { name: 'Tracked channels' })

    await userEvent.click(within(table).getByRole('button', { name: 'Remove and block alice' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove and block' }))

    expect(await screen.findByText('That channel is already gone.')).toBeInTheDocument()
    expect(api.getChannels).toHaveBeenCalledTimes(2)
  })

  it('says the action failed when the server cannot be reached, and keeps the list', async () => {
    api.getChannels.mockResolvedValue(data())
    api.removeChannel.mockResolvedValue({ kind: 'unavailable' })
    renderScreen()
    const table = await screen.findByRole('table', { name: 'Tracked channels' })

    await userEvent.click(within(table).getByRole('button', { name: 'Remove and block alice' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove and block' }))

    expect(await screen.findByText('That did not work. Nothing was changed.')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Tracked channels' })).toBeInTheDocument()
  })

  it('ends the admin session when an action is answered "signed out"', async () => {
    api.getChannels.mockResolvedValue(data())
    api.removeChannel.mockResolvedValue({ kind: 'signed_out' })
    renderScreen()
    const table = await screen.findByRole('table', { name: 'Tracked channels' })

    await userEvent.click(within(table).getByRole('button', { name: 'Remove and block alice' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove and block' }))

    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1))
  })

  it('unblocks a channel and reloads the list', async () => {
    api.getChannels.mockResolvedValue(data())
    api.unblockChannel.mockResolvedValue({ kind: 'ok', data: { ok: true } })
    renderScreen()
    const blocked = await screen.findByRole('table', { name: 'Blocked channels' })

    api.getChannels.mockResolvedValue(data([alice, bob], []))
    await userEvent.click(within(blocked).getByRole('button', { name: 'Unblock banned' }))

    expect(api.unblockChannel).toHaveBeenCalledWith('9', expect.anything())
    expect(await screen.findByText('Nothing is blocked.')).toBeInTheDocument()
  })

  it('shows an error with a retry that asks again', async () => {
    api.getChannels.mockResolvedValueOnce({ kind: 'busy' })
    renderScreen()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the channels.')

    api.getChannels.mockResolvedValueOnce(data())
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('table', { name: 'Tracked channels' })).toBeInTheDocument()
  })
})
