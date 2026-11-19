import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { windowAround, type ContextItem, type VideoContextSource } from '../../../lib/videoContext'
import ContextStrip from '../ContextStrip'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const items: ContextItem[] = Array.from({ length: 8 }, (_, i) => ({ id: `id${i}`, title: `title ${i}`, thumbnail: `u${i}` }))

function renderStrip(source: VideoContextSource, status: 'none' | 'loading' | 'ready' | 'unreadable', currentId: string) {
  return render(
    <MemoryRouter>
      <ContextStrip source={source} status={status} strip={windowAround(items, currentId)} currentId={currentId} />
    </MemoryRouter>,
  )
}

describe('ContextStrip', () => {
  it('says where you are and marks the current video', () => {
    renderStrip({ kind: 'catchup' }, 'ready', 'id3')
    expect(screen.getByText('4 of 8 · Import from YT')).toBeInTheDocument()
    expect(screen.getByLabelText('Now playing: title 3')).toHaveAttribute('aria-current', 'true')
  })
  it('keeps the queue context on the thumbnail links', () => {
    renderStrip({ kind: 'catchup' }, 'ready', 'id3')
    expect(screen.getByRole('link', { name: /title 4/ })).toHaveAttribute('href', '/youtube/id4?from=catchup')
  })
  it('keeps the playlist context on the thumbnail links', () => {
    renderStrip({ kind: 'playlist', listId: 'PLabcdefghij' }, 'ready', 'id3')
    expect(screen.getByRole('link', { name: /title 4/ })).toHaveAttribute('href', '/youtube/id4?list=PLabcdefghij')
    expect(screen.getByText('4 of 8 · Playlist')).toBeInTheDocument()
  })
  it('has previous and next links in the middle', () => {
    renderStrip({ kind: 'catchup' }, 'ready', 'id3')
    expect(screen.getByRole('link', { name: 'Previous video' })).toHaveAttribute('href', '/youtube/id2?from=catchup')
    expect(screen.getByRole('link', { name: 'Next video' })).toHaveAttribute('href', '/youtube/id4?from=catchup')
  })
  it('has no previous link on the first video', () => {
    renderStrip({ kind: 'catchup' }, 'ready', 'id0')
    expect(screen.queryByRole('link', { name: 'Previous video' })).not.toBeInTheDocument()
    expect(screen.getByText('Previous video')).toBeInTheDocument()
  })
  it('says so when a playlist cannot be read', () => {
    renderStrip({ kind: 'playlist', listId: 'PLabcdefghij' }, 'unreadable', 'id3')
    expect(screen.getByText("Can't read this playlist")).toBeInTheDocument()
  })
  it('renders nothing with no context', () => {
    const { container } = renderStrip(null, 'none', 'id3')
    expect(container).toBeEmptyDOMElement()
  })
  it('renders nothing when the video is not in the list', () => {
    const { container } = renderStrip({ kind: 'catchup' }, 'ready', 'nope')
    expect(container).toBeEmptyDOMElement()
  })
})
