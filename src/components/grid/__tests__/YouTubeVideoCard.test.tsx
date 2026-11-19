import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { YouTubeVideo } from '../../../lib/youtubeApi'
import { YouTubeVideoCard } from '../YouTubeVideoCard'

const video = (over: Partial<YouTubeVideo> = {}): YouTubeVideo => ({
  id: 'abcdefghijk',
  title: 'A title',
  channelTitle: 'A channel',
  thumbnail: 'u',
  viewCount: '1234567',
  publishedAt: '2020-03-04T00:00:00Z',
  description: '',
  ...over,
})

const renderCard = (v: YouTubeVideo) =>
  render(
    <MemoryRouter>
      <YouTubeVideoCard video={v} />
    </MemoryRouter>,
  )

describe('YouTubeVideoCard', () => {
  it('shows the view count on the thumbnail and the upload date by the channel', () => {
    renderCard(video())
    expect(screen.getByText('1.2M views')).toBeInTheDocument()
    expect(screen.getByText(/A channel/)).toHaveTextContent(/2020/)
  })
  it('still renders without a view count or a parsable date', () => {
    renderCard(video({ viewCount: undefined, publishedAt: 'nope' }))
    expect(screen.getByText('A title')).toBeInTheDocument()
    expect(screen.queryByText(/views/)).not.toBeInTheDocument()
  })
})
