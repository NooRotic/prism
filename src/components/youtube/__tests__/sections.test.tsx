import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatchupVideo } from '../../../lib/catchup'
import { searchTopic } from '../../../lib/videoPageApi'
import CommentsSection from '../CommentsSection'
import RelatedTopics from '../RelatedTopics'
import RelatedVideos from '../RelatedVideos'

vi.mock('../../../lib/videoPageApi', () => ({ searchTopic: vi.fn() }))

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('CommentsSection', () => {
  const comment = { id: 'c1', author: 'Ann', authorImage: '', text: '<b>x</b> hello', likeCount: 5, publishedAt: '2020-01-01T00:00:00Z', replyCount: 2 }

  it('shows each comment as plain text with author, likes and replies', () => {
    const { container } = wrap(<CommentsSection videoId="abc" result={{ status: 'ok', comments: [comment] }} />)
    expect(screen.getByText('Ann')).toBeInTheDocument()
    expect(container.textContent).toContain('<b>x</b> hello')
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('5 likes')).toBeInTheDocument()
    expect(screen.getByText('2 replies')).toBeInTheDocument()
  })
  it('says comments are off when they are disabled', () => {
    wrap(<CommentsSection videoId="abc" result={{ status: 'disabled' }} />)
    expect(screen.getByText('Comments are turned off for this video.')).toBeInTheDocument()
  })
  it('says it could not load them on an error', () => {
    wrap(<CommentsSection videoId="abc" result={{ status: 'error' }} />)
    expect(screen.getByText("Couldn't load comments.")).toBeInTheDocument()
  })
  it('always offers "Comment on YouTube" as a safe external link', () => {
    wrap(<CommentsSection videoId="abc" result={null} />)
    const link = screen.getByRole('link', { name: 'Comment on YouTube' })
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link).toHaveAttribute('target', '_blank')
  })
})

describe('RelatedVideos', () => {
  const v = (id: string): CatchupVideo => ({ id, title: `title ${id}`, channel: 'c', publishedAt: '', durationSec: 90, thumbnail: '' })
  it('links each card to its page with no context', () => {
    wrap(<RelatedVideos videos={[v('aaa')]} status="ready" />)
    expect(screen.getByRole('link', { name: /title aaa/ })).toHaveAttribute('href', '/youtube/aaa')
  })
  it('says so when there is nothing related', () => {
    wrap(<RelatedVideos videos={[]} status="empty" />)
    expect(screen.getByText('No related videos found.')).toBeInTheDocument()
  })
})

describe('RelatedTopics', () => {
  beforeEach(() => vi.mocked(searchTopic).mockReset())

  it('searches once on a click and shows the results as cards', async () => {
    vi.mocked(searchTopic).mockResolvedValue([{ id: 'zzz', title: 'found it', channelTitle: 'c', thumbnail: '' }])
    wrap(<RelatedTopics topics={['Video game']} apiAvailable />)
    fireEvent.click(screen.getByRole('button', { name: 'Video game' }))
    await waitFor(() => expect(screen.getByRole('link', { name: /found it/ })).toHaveAttribute('href', '/youtube/zzz'))
    expect(searchTopic).toHaveBeenCalledTimes(1)
    expect(searchTopic).toHaveBeenCalledWith('Video game')
  })
  it('says when a topic has nothing', async () => {
    vi.mocked(searchTopic).mockResolvedValue([])
    wrap(<RelatedTopics topics={['Odd']} apiAvailable />)
    fireEvent.click(screen.getByRole('button', { name: 'Odd' }))
    await waitFor(() => expect(screen.getByText('Nothing found')).toBeInTheDocument())
  })
  it('shows plain text, not buttons, without the API', () => {
    wrap(<RelatedTopics topics={['Video game']} apiAvailable={false} />)
    expect(screen.getByText('Video game')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('renders nothing without topics', () => {
    const { container } = wrap(<RelatedTopics topics={[]} apiAvailable />)
    expect(container).toBeEmptyDOMElement()
  })
})
