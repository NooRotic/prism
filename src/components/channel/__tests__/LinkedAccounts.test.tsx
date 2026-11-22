import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LinkedAccounts from '../LinkedAccounts'
import { fetchYoutubeChannel } from '../../../lib/youtubeChannelApi'
import { dismissSuggestion, findByTwitch, isDismissed, saveLink } from '../../../lib/linkedAccounts'

vi.mock('../../../lib/youtubeChannelApi', () => ({ fetchYoutubeChannel: vi.fn() }))
vi.mock('../../../lib/youtubeApi', () => ({ isYouTubeApiAvailable: () => true }))

const channel = {
  channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
  title: 'Mr Beast',
  handle: '@MrBeast',
  description: 'I also stream: twitch.tv/mrbeast',
  thumbnail: '',
}

function renderIt(description = 'Videos at youtube.com/@MrBeast', { suggest = false } = {}) {
  // These tests are about the modal: keep the automatic same-name lookup out of them unless a test asks for it.
  if (!suggest) dismissSuggestion('mrbeast')
  return render(
    <MemoryRouter>
      <LinkedAccounts login="MrBeast" description={description} />
    </MemoryRouter>,
  )
}
const openModal = () => fireEvent.click(screen.getByRole('button', { name: /Link accounts/ }))
const dialog = () => screen.getByRole('dialog', { name: 'Link accounts' })
const fill = (label: RegExp, value: string) => fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } })
const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Check and save' }))

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchYoutubeChannel).mockReset()
})

describe('LinkedAccounts', () => {
  it('offers only the Link accounts button when nothing is linked', () => {
    renderIt()
    expect(screen.getByRole('button', { name: /Link accounts/ })).toBeInTheDocument()
    expect(screen.queryByText(/Also on/)).not.toBeInTheDocument()
  })

  it('draws the eye to Link accounts as a PRISM feature: a spectrum-outlined button with the line-art prism, not plain text', () => {
    renderIt()
    const button = screen.getByRole('button', { name: /Link accounts/ })
    expect(button.querySelector('[data-prism-mark="icon"]')).not.toBeNull()
    expect(button.parentElement).toHaveClass('prism-pill')
    // The same on a channel that is already linked (Edit links), so the feature stays easy to find.
    act(() => saveLink({ twitch: 'mrbeast', youtube: { channelId: channel.channelId, title: 'Mr Beast', handle: '@MrBeast' }, confirmed: true, linkedAt: 1 }))
    const edit = screen.getByRole('button', { name: /Edit links/ })
    expect(edit.querySelector('[data-prism-mark="icon"]')).not.toBeNull()
    expect(edit.parentElement).toHaveClass('prism-pill')
  })

  it('links a YouTube channel and marks it confirmed when both bios name each other', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel })
    renderIt()
    openModal()
    fill(/YouTube/, 'https://www.youtube.com/@MrBeast')
    save()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(fetchYoutubeChannel).toHaveBeenCalledWith({ handle: 'MrBeast' })
    expect(findByTwitch('mrbeast')).toMatchObject({ confirmed: true, youtube: { channelId: channel.channelId, title: 'Mr Beast' } })
    const chip = screen.getByRole('link', { name: /YouTube/ })
    expect(chip).toHaveAttribute('href', '/youtube?q=latest+MrBeast')
    expect(screen.getByText(/Also on/)).toBeInTheDocument()
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument()
  })

  it('saves it as the viewer\'s own link, and says so, when the bios do not name each other', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel })
    renderIt('no links in my bio')
    openModal()
    fill(/YouTube/, '@MrBeast')
    save()
    await waitFor(() => expect(findByTwitch('mrbeast')?.confirmed).toBe(false))
    expect(screen.getByText(/linked by you/i)).toBeInTheDocument()
  })

  it('refuses text that is not a YouTube channel link, without a call', () => {
    renderIt()
    openModal()
    fill(/YouTube/, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    save()
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/YouTube channel/i)
    expect(fetchYoutubeChannel).not.toHaveBeenCalled()
    expect(findByTwitch('mrbeast')).toBeNull()
  })

  it.each([
    [{ status: 'notfound' as const }, /No YouTube channel found/i],
    [{ status: 'error' as const }, /Could not reach YouTube/i],
  ])('says so, and saves nothing, when YouTube answers %j', async (answer, text) => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(answer)
    renderIt()
    openModal()
    fill(/YouTube/, '@nobody')
    save()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(text)
    expect(findByTwitch('mrbeast')).toBeNull()
  })

  it('links a Kick channel on its own, without a check, as the viewer\'s own link', async () => {
    renderIt()
    openModal()
    fill(/Kick/, 'https://kick.com/MrBeast')
    save()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(fetchYoutubeChannel).not.toHaveBeenCalled()
    const chip = screen.getByRole('link', { name: /Kick/ })
    expect(chip).toHaveAttribute('href', 'https://kick.com/mrbeast')
    expect(chip).toHaveAttribute('target', '_blank')
    expect(chip.getAttribute('rel')).toContain('noopener')
  })

  it('asks for at least one link', () => {
    renderIt()
    openModal()
    save()
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/YouTube or Kick/i)
  })

  it('shows links saved earlier, fills the modal with them, and can remove them', () => {
    saveLink({ twitch: 'mrbeast', youtube: { channelId: channel.channelId, title: 'Mr Beast', handle: '@MrBeast' }, confirmed: true, linkedAt: 1 })
    renderIt()
    expect(screen.getByRole('link', { name: /YouTube/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Edit links/ }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove links' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /YouTube/ })).not.toBeInTheDocument()
    expect(findByTwitch('mrbeast')).toBeNull()
  })

  it('closes on Escape and on Cancel, saving nothing', () => {
    renderIt()
    openModal()
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    openModal()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(findByTwitch('mrbeast')).toBeNull()
  })
})

describe('LinkedAccounts: a same-name YouTube channel', () => {
  const same = { ...channel, title: 'Mr Beast', handle: '@MrBeast', description: 'I love fighting games!' }

  it('offers it as a Possibly link next to Link accounts, which opens the modal with it filled in', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel: same })
    renderIt('no links', { suggest: true })
    const possibly = await screen.findByRole('button', { name: 'Possibly "@MrBeast"?' })
    expect(fetchYoutubeChannel).toHaveBeenCalledWith({ handle: 'MrBeast' })
    fireEvent.click(possibly)
    expect((within(dialog()).getByLabelText(/YouTube/) as HTMLInputElement).value).toBe('@MrBeast')
    save()
    await waitFor(() => expect(findByTwitch('mrbeast')).toMatchObject({ confirmed: false }))
    expect(screen.queryByRole('button', { name: /Possibly/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /YouTube/ })).toBeInTheDocument()
  })

  it('remembers "Not them" (the x) and stops offering it', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel: same })
    renderIt('no links', { suggest: true })
    await screen.findByRole('button', { name: /Possibly/ })
    fireEvent.click(screen.getByRole('button', { name: 'Not them' }))
    expect(screen.queryByRole('button', { name: /Possibly/ })).not.toBeInTheDocument()
    expect(isDismissed('mrbeast')).toBe(true)
    expect(findByTwitch('mrbeast')).toBeNull()
  })

  it('links it by itself, as confirmed, when both bios name each other', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel: { ...same, description: 'also at twitch.tv/mrbeast' } })
    renderIt('Videos at youtube.com/@MrBeast', { suggest: true })
    await waitFor(() => expect(findByTwitch('mrbeast')?.confirmed).toBe(true))
    expect(screen.queryByRole('button', { name: /Possibly/ })).not.toBeInTheDocument()
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument()
  })

  it('says nothing when there is no same-name channel', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'notfound' })
    renderIt('no links', { suggest: true })
    await waitFor(() => expect(fetchYoutubeChannel).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Possibly/ })).not.toBeInTheDocument()
  })
})
