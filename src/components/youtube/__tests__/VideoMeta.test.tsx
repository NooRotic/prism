import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VideoPageData } from '../../../lib/videoPageApi'
import DescriptionBlock from '../DescriptionBlock'
import VideoMeta from '../VideoMeta'

const data = (over: Partial<VideoPageData> = {}): VideoPageData => ({
  id: 'abcdefghijk',
  title: 'A title',
  channelTitle: 'A channel',
  channelId: 'UC1',
  thumbnail: '',
  publishedAt: '2020-03-04T00:00:00Z',
  viewCount: '1234567',
  description: '',
  tags: [],
  topics: [],
  ...over,
})

describe('VideoMeta', () => {
  it('makes each tag a button that opens its topic when the page handles topics', () => {
    const onTopic = vi.fn()
    render(<VideoMeta data={data({ tags: ['Alpha', 'Beta'] })} onTopic={onTopic} />)
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }))
    expect(onTopic).toHaveBeenCalledWith('Beta')
  })
  it('leaves the tags as plain text without a handler', () => {
    render(<VideoMeta data={data({ tags: ['Alpha'] })} />)
    expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument()
  })
  it('leaves the title to the page when showTitle is false', () => {
    render(<VideoMeta data={data()} showTitle={false} />)
    expect(screen.queryByRole('heading', { name: 'A title' })).not.toBeInTheDocument()
    expect(screen.getByText('A channel')).toBeInTheDocument()
  })
  it('shows title, channel, views and the upload date', () => {
    render(<VideoMeta data={data()} />)
    expect(screen.getByRole('heading', { name: 'A title' })).toBeInTheDocument()
    expect(screen.getByText('A channel')).toBeInTheDocument()
    expect(screen.getByText('1.2M views')).toBeInTheDocument()
    expect(screen.getByText(/2020/)).toBeInTheDocument()
  })
  it('shows 8 tags and reveals the rest behind a "+N more" button', () => {
    const tags = Array.from({ length: 12 }, (_, i) => `tag${i}`)
    render(<VideoMeta data={data({ tags })} />)
    expect(screen.getByText('tag7')).toBeInTheDocument()
    expect(screen.queryByText('tag8')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+4 more' }))
    expect(screen.getByText('tag11')).toBeInTheDocument()
  })
  it('has no tag row without tags', () => {
    render(<VideoMeta data={data()} />)
    expect(screen.queryByLabelText('Tags')).not.toBeInTheDocument()
  })
  it('renders a placeholder row without data', () => {
    render(<VideoMeta data={null} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('DescriptionBlock', () => {
  it('keeps line breaks and turns a URL into a safe link', () => {
    const { container } = render(<DescriptionBlock text={'first\n\nsee https://example.com/x.'} />)
    const link = screen.getByRole('link', { name: 'https://example.com/x' })
    expect(link).toHaveAttribute('href', 'https://example.com/x')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link).toHaveAttribute('target', '_blank')
    expect(container.querySelector('p')?.className).toContain('whitespace-pre-wrap')
  })
  it('shows markup as text, never as an element', () => {
    const { container } = render(<DescriptionBlock text={'<script>alert(1)</script>'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })
  it('folds a long description behind Show more', () => {
    render(<DescriptionBlock text={'x'.repeat(600)} />)
    const more = screen.getByRole('button', { name: 'Show more' })
    fireEvent.click(more)
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })
  it('has no toggle for a short description', () => {
    render(<DescriptionBlock text="short" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
