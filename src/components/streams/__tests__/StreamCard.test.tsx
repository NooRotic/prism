import { fireEvent, render, screen } from '@testing-library/react'
import StreamCard from '../StreamCard'
import type { StreamEntry } from '../../../lib/streamsApi'

vi.mock('../../../config/historyServer', () => ({
  HISTORY_ENABLED: true,
  HISTORY_API_URL: 'https://history.test',
  SEND_VISITS: false,
}))

function stream(over: Partial<StreamEntry> = {}): StreamEntry {
  return {
    id: '0123456789ab',
    name: 'Alpha News',
    groups: [0],
    country: 'us',
    logo: null,
    kind: 'hls',
    pinned: false,
    state: 'new',
    url: 'https://secret-host.test/live.m3u8?token=abc',
    ...over,
  }
}

describe('StreamCard', () => {
  it('shows the name, the flag and an unchecked badge for a stream nobody has checked yet', () => {
    const { container } = render(<StreamCard stream={stream()} selected={false} onSelect={() => {}} />)

    expect(screen.getByRole('button', { name: /alpha news/i })).toBeInTheDocument()
    expect(screen.getByText('Alpha News')).toBeInTheDocument()
    expect(container.querySelector('img[src*="us.svg"], img[src^="data:image/svg"]')).not.toBeNull()
    expect(screen.getByText(/unchecked/i)).toBeInTheDocument()
  })

  it('reads larger: the name at about 17 px and the line under it at 14 px, with a bigger picture', () => {
    const { container } = render(<StreamCard stream={stream({ pinned: true })} selected={false} onSelect={() => {}} />)

    expect(screen.getByText('Alpha News').className).toContain('text-[1.1rem]')
    expect(screen.getByText(/unchecked/i).parentElement?.className).toContain('text-sm')
    expect(screen.getByText(/pinned/i)).toBeInTheDocument()
    const tile = container.querySelector<HTMLElement>('[data-letter-tile]')
    expect([tile?.style.width, tile?.style.height]).toEqual(['64px', '64px'])
  })

  it('has no badge for a working stream', () => {
    render(<StreamCard stream={stream({ state: 'working' })} selected={false} onSelect={() => {}} />)

    expect(screen.queryByText(/unchecked/i)).toBeNull()
  })

  it('marks a pinned stream', () => {
    render(<StreamCard stream={stream({ pinned: true, state: 'working' })} selected={false} onSelect={() => {}} />)

    expect(screen.getByText(/pinned/i)).toBeInTheDocument()
  })

  it('draws no flag for a stream with no country', () => {
    const { container } = render(<StreamCard stream={stream({ country: null })} selected={false} onSelect={() => {}} />)

    expect(container.querySelector('img')).toBeNull()
  })

  it('shows the copied logo from the server, lazily and with no referrer', () => {
    const { container } = render(<StreamCard stream={stream({ logo: '0123456789ab.png', country: null })} selected={false} onSelect={() => {}} />)

    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://history.test/logos/0123456789ab.png')
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('draws a letter tile when there is no logo, and when the picture fails to load', () => {
    const { container, rerender } = render(<StreamCard stream={stream({ country: null })} selected={false} onSelect={() => {}} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('A', { selector: '[data-letter-tile]' })).toBeInTheDocument()

    rerender(<StreamCard stream={stream({ logo: '0123456789ab.png', country: null, id: 'ffffffffffff', name: 'zed' })} selected={false} onSelect={() => {}} />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()

    fireEvent.error(img)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Z', { selector: '[data-letter-tile]' })).toBeInTheDocument()
  })

  it('draws a letter tile for a logo file name the server would never write', () => {
    const { container } = render(<StreamCard stream={stream({ logo: '../evil.png', country: null })} selected={false} onSelect={() => {}} />)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-letter-tile]')).not.toBeNull()
  })

  it('takes the tile colour from the id, so a stream keeps its colour', () => {
    const colour = (id: string) => {
      const { container, unmount } = render(<StreamCard stream={stream({ id, country: null })} selected={false} onSelect={() => {}} />)
      const value = (container.querySelector('[data-letter-tile]') as HTMLElement).style.background
      unmount()
      return value
    }

    expect(colour('0123456789ab')).toBe(colour('0123456789ab'))
    expect(colour('0123456789ab')).not.toBe(colour('ba9876543210'))
  })

  it('uses the first character of a name, even an emoji, and a question mark for no name', () => {
    const { rerender } = render(<StreamCard stream={stream({ name: '🎬 Movies', country: null })} selected={false} onSelect={() => {}} />)
    expect(screen.getByText('🎬', { selector: '[data-letter-tile]' })).toBeInTheDocument()

    rerender(<StreamCard stream={stream({ name: '', country: null })} selected={false} onSelect={() => {}} />)
    expect(screen.getByText('?', { selector: '[data-letter-tile]' })).toBeInTheDocument()
  })

  it('shows markup in a name as text and creates no element from it', () => {
    const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>'
    const { container } = render(<StreamCard stream={stream({ name: evil, country: null })} selected={false} onSelect={() => {}} />)

    expect(screen.getByText(evil)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('never puts the stream address on the card', () => {
    const { container } = render(<StreamCard stream={stream()} selected={false} onSelect={() => {}} />)

    expect(container.innerHTML).not.toContain('secret-host')
    expect(container.innerHTML).not.toContain('token=abc')
  })

  it('selects its stream when clicked', () => {
    const onSelect = vi.fn()
    render(<StreamCard stream={stream()} selected={false} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('0123456789ab')
  })

  it('says which card is selected', () => {
    const { rerender } = render(<StreamCard stream={stream()} selected={false} onSelect={() => {}} />)
    expect(screen.getByRole('button').getAttribute('aria-current')).toBeNull()

    rerender(<StreamCard stream={stream()} selected={true} onSelect={() => {}} />)

    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true')
  })
})
