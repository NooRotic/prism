import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YouTubeGrid } from '../YouTubeGrid'
import { latestFromChannel, moreFromChannel } from '../../../lib/channelLatestApi'
import { searchTopicPage } from '../../../lib/videoPageApi'
import { markQuotaReached, resetQuotaForTests } from '../../../lib/youtubeQuota'

vi.mock('../../../lib/channelLatestApi', () => ({ latestFromChannel: vi.fn(), moreFromChannel: vi.fn() }))
vi.mock('../../../lib/videoPageApi', async (orig) => ({ ...(await orig<object>()), searchTopicPage: vi.fn() }))
vi.mock('../../../lib/videoStats', () => ({ withStats: vi.fn(async (videos: unknown[]) => videos) }))
vi.mock('../../../lib/youtubeApi', () => ({
  isYouTubeApiAvailable: () => true,
  getPopularVideos: vi.fn().mockResolvedValue({
    videos: [{ id: 'popularpop1', title: 'a popular one', channelTitle: 'p', thumbnail: '', publishedAt: '', description: '' }],
    nextPageToken: null,
  }),
  searchYouTubeVideos: vi.fn().mockResolvedValue({ videos: [], nextPageToken: null }),
}))

const vid = (id: string, title: string) => ({ id, title, channelTitle: 'Mr Beast', thumbnail: '', publishedAt: '2026-11-20T10:00:00Z', description: '' })
const dated = (id: string, title: string, publishedAt: string, viewCount: string) => ({ ...vid(id, title), publishedAt, viewCount })
const hit = (id: string, title: string) => ({ id, title, channelTitle: 'c', thumbnail: '' })
const channelOk = (videos: ReturnType<typeof vid>[], over: Record<string, unknown> = {}) => ({
  status: 'ok' as const,
  channelTitle: 'Mr Beast',
  videos,
  total: null,
  playlistId: 'UUabc',
  nextPageToken: null,
  ...over,
})

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.pathname + l.search}</div>
}
function renderGrid(path = '/youtube') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <YouTubeGrid />
      <Where />
    </MemoryRouter>,
  )
}
const where = () => screen.getByTestId('where').textContent
const param = (name: string) => new URLSearchParams(where()!.split('?')[1] ?? '').get(name)

const searchFor = (text: string) => {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search YouTube' }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}
const titles = () => screen.getAllByTestId('yt-card-title').map((e) => e.textContent)

beforeEach(() => {
  localStorage.clear()
  resetQuotaForTests()
  vi.mocked(latestFromChannel).mockReset()
  vi.mocked(moreFromChannel).mockReset()
  vi.mocked(searchTopicPage).mockReset()
})

describe('YouTubeGrid search', () => {
  it('turns "latest <youtuber> video" into that channel\'s newest uploads, without a topic search', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(channelOk([vid('aaaaaaaaaaa', 'newest upload')]))
    renderGrid()
    searchFor('latest MrBeast video')
    const results = await screen.findByRole('region', { name: 'Search results' })
    expect(latestFromChannel).toHaveBeenCalledWith('MrBeast')
    expect(searchTopicPage).not.toHaveBeenCalled()
    expect(results).toHaveTextContent('Latest from Mr Beast')
    expect(await screen.findByText('newest upload')).toBeInTheDocument()
    expect(screen.queryByText('a popular one')).not.toBeInTheDocument()
  })

  it('runs an ordinary search for anything else', async () => {
    vi.mocked(searchTopicPage).mockResolvedValue({ videos: [hit('sssssssssss', 'speedrun')], nextPageToken: null })
    renderGrid()
    searchFor('minecraft speedrun')
    expect(await screen.findByText('speedrun')).toBeInTheDocument()
    expect(searchTopicPage).toHaveBeenCalledWith('minecraft speedrun')
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
    vi.mocked(searchTopicPage).mockResolvedValue({ videos: [hit('sssssssssss', 'speedrun')], nextPageToken: null })
    renderGrid()
    await screen.findByText('a popular one')
    searchFor('minecraft speedrun')
    await screen.findByText('speedrun')
    expect(screen.queryByText('a popular one')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await screen.findByText('a popular one')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument()
    expect(where()).toBe('/youtube')
  })

  it('ignores an older answer that arrives after a newer search', async () => {
    let finishFirst: (v: Awaited<ReturnType<typeof latestFromChannel>>) => void = () => {}
    vi.mocked(latestFromChannel).mockReturnValueOnce(new Promise((r) => (finishFirst = r)))
    vi.mocked(searchTopicPage).mockResolvedValue({ videos: [hit('sssssssssss', 'second answer')], nextPageToken: null })
    renderGrid()
    searchFor('latest slowchannel')
    searchFor('minecraft')
    expect(await screen.findByText('second answer')).toBeInTheDocument()
    finishFirst(channelOk([vid('aaaaaaaaaaa', 'late answer')]))
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

describe('YouTubeGrid search sorting', () => {
  const threeVideos = [
    dated('aaaaaaaaaaa', 'mid', '2026-05-01T00:00:00Z', '500'),
    dated('bbbbbbbbbbb', 'old', '2026-01-01T00:00:00Z', '9000'),
    dated('ccccccccccc', 'new', '2026-11-01T00:00:00Z', '10'),
  ]

  it('lists newest first by default, and re-sorts to oldest and most viewed on a click', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(channelOk(threeVideos))
    renderGrid()
    searchFor('latest MrBeast video')
    await screen.findByText('mid')
    expect(titles()).toEqual(['new', 'mid', 'old'])
    expect(screen.getByRole('button', { name: 'Newest' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    expect(titles()).toEqual(['old', 'mid', 'new'])
    fireEvent.click(screen.getByRole('button', { name: 'Most viewed' }))
    expect(titles()).toEqual(['old', 'mid', 'new'])
    expect(screen.getByRole('button', { name: 'Most viewed' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Newest' }))
    expect(titles()).toEqual(['new', 'mid', 'old'])
  })

  it('goes back to Newest for the next search', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(channelOk(threeVideos))
    renderGrid()
    searchFor('latest MrBeast video')
    await screen.findByText('mid')
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    searchFor('latest MrBeast video two')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Newest' })).toHaveAttribute('aria-pressed', 'true'))
  })

  it('offers no sort buttons for a single video', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(channelOk([threeVideos[0]]))
    renderGrid()
    searchFor('latest MrBeast video')
    await screen.findByText('mid')
    expect(screen.queryByRole('group', { name: 'Sort by' })).not.toBeInTheDocument()
  })
})

describe('YouTubeGrid search remembered in the address (the Back button)', () => {
  it('puts the search and the sort in the address, so Back from a video returns to them', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(
      channelOk([dated('aaaaaaaaaaa', 'a', '2026-05-01T00:00:00Z', '5'), dated('bbbbbbbbbbb', 'b', '2026-06-01T00:00:00Z', '6')]),
    )
    renderGrid()
    searchFor('latest MrBeast video')
    await screen.findByText('a')
    expect(param('q')).toBe('latest MrBeast video')
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    expect(param('sort')).toBe('oldest')
  })

  it('shows the search again when the page is opened on an address that holds one', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(
      channelOk([dated('aaaaaaaaaaa', 'older', '2026-05-01T00:00:00Z', '5'), dated('bbbbbbbbbbb', 'newer', '2026-06-01T00:00:00Z', '6')]),
    )
    renderGrid('/youtube?q=latest+MrBeast+video&sort=oldest')
    expect(await screen.findByText('older')).toBeInTheDocument()
    expect(latestFromChannel).toHaveBeenCalledWith('MrBeast')
    expect(titles()).toEqual(['older', 'newer'])
    expect(screen.getByRole('button', { name: 'Oldest' })).toHaveAttribute('aria-pressed', 'true')
    expect((screen.getByRole('searchbox', { name: 'Search YouTube' }) as HTMLInputElement).value).toBe('latest MrBeast video')
  })

  it('ignores an unknown sort in the address', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(
      channelOk([dated('aaaaaaaaaaa', 'one', '2026-05-01T00:00:00Z', '5'), dated('bbbbbbbbbbb', 'two', '2026-06-01T00:00:00Z', '6')]),
    )
    renderGrid('/youtube?q=latest+MrBeast&sort=nonsense')
    await screen.findByText('one')
    expect(screen.getByRole('button', { name: 'Newest' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('YouTubeGrid: how many videos are loaded, and loading more', () => {
  const page1 = Array.from({ length: 3 }, (_, i) => dated(`p1video${i}`.padEnd(11, 'x'), `first ${i}`, `2026-1${i}-01T00:00:00Z`, '1'))

  it('says how many are loaded out of how many the channel has', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(channelOk(page1, { total: 3412, nextPageToken: 'P2' }))
    renderGrid()
    searchFor('latest MrBeast video')
    await screen.findByText('first 0')
    expect(screen.getByTestId('loaded-count')).toHaveTextContent('Loaded 3 of 3,412 videos')
  })

  it('loads the next page and adds it to the list', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(channelOk(page1, { total: 5, nextPageToken: 'P2' }))
    vi.mocked(moreFromChannel).mockResolvedValue({
      status: 'ok',
      videos: [dated('p2video0xxx', 'second 0', '2025-01-01T00:00:00Z', '2'), dated('p2video1xxx', 'second 1', '2025-02-01T00:00:00Z', '2')],
      nextPageToken: null,
    })
    renderGrid()
    searchFor('latest MrBeast video')
    await screen.findByText('first 0')
    fireEvent.click(screen.getByRole('button', { name: /Load 50 more/ }))
    await screen.findByText('second 0')
    expect(moreFromChannel).toHaveBeenCalledWith('UUabc', 'P2')
    expect(screen.getByTestId('loaded-count')).toHaveTextContent('Loaded 5 of 5 videos')
    expect(screen.queryByRole('button', { name: /Load 50 more/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Load all/ })).not.toBeInTheDocument()
  })

  it('loads every page on "Load all" and stops at the end', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(channelOk(page1, { total: 9, nextPageToken: 'P2' }))
    vi.mocked(moreFromChannel)
      .mockResolvedValueOnce({ status: 'ok', videos: [dated('p2video0xxx', 'second 0', '2025-01-01T00:00:00Z', '2')], nextPageToken: 'P3' })
      .mockResolvedValueOnce({ status: 'ok', videos: [dated('p3video0xxx', 'third 0', '2024-01-01T00:00:00Z', '3')], nextPageToken: null })
    renderGrid()
    searchFor('latest MrBeast video')
    await screen.findByText('first 0')
    fireEvent.click(screen.getByRole('button', { name: /Load all/ }))
    await screen.findByText('third 0')
    expect(moreFromChannel).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('loaded-count')).toHaveTextContent('Loaded 5 of 9 videos')
  })

  it('says that Oldest is only the oldest of what is loaded, until everything is', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(channelOk(page1, { total: 3412, nextPageToken: 'P2' }))
    renderGrid()
    searchFor('latest MrBeast video')
    await screen.findByText('first 0')
    expect(screen.queryByText(/oldest of the 3 loaded/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    expect(screen.getByText(/oldest of the 3 loaded/i)).toBeInTheDocument()
  })

  it('keeps what is loaded and says so when a further page cannot be read', async () => {
    vi.mocked(latestFromChannel).mockResolvedValue(channelOk(page1, { total: 9, nextPageToken: 'P2' }))
    vi.mocked(moreFromChannel).mockResolvedValue({ status: 'error' })
    renderGrid()
    searchFor('latest MrBeast video')
    await screen.findByText('first 0')
    fireEvent.click(screen.getByRole('button', { name: /Load 50 more/ }))
    expect(await screen.findByText(/could not load more/i)).toBeInTheDocument()
    expect(screen.getByText('first 0')).toBeInTheDocument()
  })

  it('offers more results for an ordinary search, and says it uses the daily quota', async () => {
    vi.mocked(searchTopicPage)
      .mockResolvedValueOnce({ videos: [hit('sssssssssss', 'speedrun one')], nextPageToken: 'S2' })
      .mockResolvedValueOnce({ videos: [hit('ttttttttttt', 'speedrun two')], nextPageToken: null })
    renderGrid()
    searchFor('minecraft speedrun')
    await screen.findByText('speedrun one')
    expect(screen.queryByRole('button', { name: /Load all/ })).not.toBeInTheDocument()
    const more = screen.getByRole('button', { name: /More results/ })
    expect(more).toHaveTextContent(/100 units/)
    fireEvent.click(more)
    await screen.findByText('speedrun two')
    expect(searchTopicPage).toHaveBeenLastCalledWith('minecraft speedrun', 'S2')
    expect(screen.queryByRole('button', { name: /More results/ })).not.toBeInTheDocument()
  })
})

describe('YouTubeGrid: recent searches', () => {
  it('remembers searches and shows them as buttons that run them again', async () => {
    vi.mocked(searchTopicPage).mockResolvedValue({ videos: [hit('sssssssssss', 'a result')], nextPageToken: null })
    renderGrid()
    searchFor('minecraft speedrun')
    await screen.findByText('a result')
    searchFor('lofi beats')
    await waitFor(() => expect(searchTopicPage).toHaveBeenCalledTimes(2))
    const recent = screen.getByRole('group', { name: 'Recent searches' })
    expect(within(recent).getAllByRole('button').map((b) => b.textContent)).toEqual(['lofi beats', 'minecraft speedrun', 'Clear'])
    fireEvent.click(within(recent).getByRole('button', { name: 'minecraft speedrun' }))
    await waitFor(() => expect(param('q')).toBe('minecraft speedrun'))
    expect((screen.getByRole('searchbox', { name: 'Search YouTube' }) as HTMLInputElement).value).toBe('minecraft speedrun')
  })

  it('shows searches from an earlier visit, and can forget them', () => {
    localStorage.setItem('prism_youtube_search_history', JSON.stringify(['old search']))
    renderGrid()
    const recent = screen.getByRole('group', { name: 'Recent searches' })
    expect(within(recent).getByRole('button', { name: 'old search' })).toBeInTheDocument()
    fireEvent.click(within(recent).getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument()
    expect(localStorage.getItem('prism_youtube_search_history')).toBe('[]')
  })

  it('shows no recent list when there is no history', () => {
    renderGrid()
    expect(screen.queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument()
  })
})
