import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YouTubeGrid } from '../YouTubeGrid'
import { latestFromChannel } from '../../../lib/channelLatestApi'
import { searchTopic } from '../../../lib/videoPageApi'
import { markQuotaReached, resetQuotaForTests } from '../../../lib/youtubeQuota'

vi.mock('../../../lib/channelLatestApi', () => ({ latestFromChannel: vi.fn() }))
vi.mock('../../../lib/videoPageApi', () => ({ searchTopic: vi.fn() }))
vi.mock('../../../lib/youtubeApi', () => ({
  isYouTubeApiAvailable: () => true,
  getPopularVideos: vi.fn().mockResolvedValue({
    videos: [{ id: 'popularpop1', title: 'a popular one', channelTitle: 'p', thumbnail: '', publishedAt: '', description: '' }],
    nextPageToken: null,
  }),
  searchYouTubeVideos: vi.fn().mockResolvedValue({ videos: [], nextPageToken: null }),
}))

const vid = (id: string, title: string) => ({ id, title, channelTitle: 'Mr Beast', thumbnail: '', publishedAt: '2026-11-20T10:00:00Z', description: '' })

function renderGrid() {
  return render(
    <MemoryRouter>
      <YouTubeGrid />
    </MemoryRouter>,
  )
}

const searchFor = (text: string) => {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search YouTube' }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

beforeEach(() => {
  localStorage.clear()
  resetQuotaForTests()
  vi.mocked(latestFromChannel).mockReset()
  vi.mocked(searchTopic).mockReset()
})

describe('YouTubeGrid search', () => {
  it('turns "latest <youtuber> video" into that channel\'s newest uploads, without a topic search', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue({ status: 'ok', channelTitle: 'Mr Beast', videos: [vid('aaaaaaaaaaa', 'newest upload')] })
    renderGrid()
    searchFor('latest MrBeast video')
    const results = await screen.findByRole('region', { name: 'Search results' })
    expect(latestFromChannel).toHaveBeenCalledWith('MrBeast')
    expect(searchTopic).not.toHaveBeenCalled()
    expect(results).toHaveTextContent('Latest from Mr Beast')
    expect(await screen.findByText('newest upload')).toBeInTheDocument()
    expect(screen.queryByText('a popular one')).not.toBeInTheDocument()
  })

  it('runs an ordinary search for anything else', async () => {
    vi.mocked(searchTopic).mockResolvedValue([{ id: 'sssssssssss', title: 'speedrun', channelTitle: 'c', thumbnail: '' }])
    renderGrid()
    searchFor('minecraft speedrun')
    expect(await screen.findByText('speedrun')).toBeInTheDocument()
    expect(searchTopic).toHaveBeenCalledWith('minecraft speedrun')
    expect(latestFromChannel).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Search results' })).toHaveTextContent('Results for minecraft speedrun')
  })

  it.each([
    [{ status: 'notfound' as const }, 'Nothing found'],
    [{ status: 'error' as const }, 'Could not reach YouTube'],
  ])('says so when the channel lookup answers %j', async (answer, text) => {
    vi.mocked(latestFromChannel).mockResolvedValue(answer)
    renderGrid()
    searchFor('latest nobody')
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it('goes back to the categories on "Clear search" and when a category is chosen', async () => {
    vi.mocked(searchTopic).mockResolvedValue([{ id: 'sssssssssss', title: 'speedrun', channelTitle: 'c', thumbnail: '' }])
    renderGrid()
    await screen.findByText('a popular one')
    searchFor('minecraft speedrun')
    await screen.findByText('speedrun')
    expect(screen.queryByText('a popular one')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await screen.findByText('a popular one')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument()
  })

  it('ignores an older answer that arrives after a newer search', async () => {
    let finishFirst: (v: Awaited<ReturnType<typeof latestFromChannel>>) => void = () => {}
    vi.mocked(latestFromChannel).mockReturnValueOnce(new Promise((r) => (finishFirst = r)))
    vi.mocked(searchTopic).mockResolvedValue([{ id: 'sssssssssss', title: 'second answer', channelTitle: 'c', thumbnail: '' }])
    renderGrid()
    searchFor('latest slowchannel')
    searchFor('minecraft')
    expect(await screen.findByText('second answer')).toBeInTheDocument()
    finishFirst({ status: 'ok', channelTitle: 'Slow', videos: [vid('aaaaaaaaaaa', 'late answer')] })
    await waitFor(() => expect(screen.queryByText('late answer')).not.toBeInTheDocument())
    expect(screen.getByText('second answer')).toBeInTheDocument()
  })

  it('shows the quota notice when the daily limit is used up', () => {
    renderGrid()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    markQuotaReached()
    return waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/daily limit/))
  })
})
