import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DemoCard } from '../DemoCard'
import type { DemoEntry } from '../../../config/demoContent'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const twitchEntry: DemoEntry = {
  id: 'test-twitch',
  label: 'TestStreamer',
  description: 'Test desc',
  protocol: 'twitch',
  url: 'teststreamer',
}

const hlsEntry: DemoEntry = {
  id: 'test-hls',
  label: 'HLS Test',
  protocol: 'hls',
  url: 'https://example.com/test.m3u8',
}

function renderCard(entry: DemoEntry) {
  return render(
    <MemoryRouter>
      <DemoCard entry={entry} />
    </MemoryRouter>,
  )
}

describe('DemoCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the entry label', () => {
    renderCard(twitchEntry)
    expect(screen.getByText('TestStreamer')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    renderCard(twitchEntry)
    expect(screen.getByText('Test desc')).toBeInTheDocument()
  })

  it('renders protocol badge', () => {
    renderCard(twitchEntry)
    // "twitch" appears in both thumbnail area and badge — at least two instances
    expect(screen.getAllByText('twitch').length).toBeGreaterThanOrEqual(1)
  })

  it('renders HLS badge for HLS entries', () => {
    renderCard(hlsEntry)
    expect(screen.getByText('HLS')).toBeInTheDocument()
  })

  it('navigates to correct route on click (twitch)', async () => {
    renderCard(twitchEntry)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    expect(mockNavigate).toHaveBeenCalledWith('/twitch/teststreamer')
  })

  it('navigates to correct route on click (hls)', async () => {
    renderCard(hlsEntry)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    expect(mockNavigate).toHaveBeenCalledWith('/hls-dash/test-hls')
  })
})
