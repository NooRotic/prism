import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DemoGrid } from '../DemoGrid'
import type { DemoEntry } from '../../../config/demoContent'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

const entries: DemoEntry[] = [
  { id: 'a', label: 'Alpha', protocol: 'twitch', url: 'alpha' },
  { id: 'b', label: 'Beta', protocol: 'youtube', url: 'https://youtu.be/123' },
  { id: 'c', label: 'Gamma', protocol: 'hls', url: 'https://example.com/test.m3u8' },
]

describe('DemoGrid', () => {
  it('renders all entries', () => {
    render(
      <MemoryRouter>
        <DemoGrid entries={entries} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('renders nothing when entries is empty', () => {
    const { container } = render(
      <MemoryRouter>
        <DemoGrid entries={[]} />
      </MemoryRouter>,
    )
    expect(container.innerHTML).toBe('')
  })
})
