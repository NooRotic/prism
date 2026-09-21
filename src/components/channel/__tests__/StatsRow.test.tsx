import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../../../contexts/AppContext'
import StatsRow from '../StatsRow'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'

vi.mock('../../../hooks/useClipStats', () => ({
  useClipStats: vi.fn(() => ({
    totalClips: 0,
    totalViews: 0,
    topClips: [],
    topClippers: [],
    uniqueClippers: 0,
    gameBreakdown: [],
    avgViewsPerClip: 0,
  })),
}))

vi.mock('../../../hooks/useDerivedStats', () => ({
  useDerivedStats: vi.fn(() => ({
    vodStats: {
      totalHoursStreamed: 0,
      totalVODs: 0,
      avgStreamLength: 0,
    },
    diversity: {
      uniqueGames: 0,
      diversityLabel: 'One-trick',
      totalVODsAnalyzed: 0,
    },
    clipEngagement: {
      clipsPerStreamHour: 0,
      avgViewsPerClip: 0,
    },
    growth: {
      clipCreationRate: 0,
      vodViewTrend: 0,
    },
  })),
}))

// StatsRow is auth-gated: without a token Helix returns nothing, so the
// stats would all be zero. These tests are about stat rendering, so they
// default to authenticated; the logged-out block below covers the gate.
vi.mock('../../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: vi.fn(),
}))

const mockedUseTwitchAuth = vi.mocked(useTwitchAuth)

function setAuth(isAuthenticated: boolean) {
  mockedUseTwitchAuth.mockReturnValue({
    isAuthenticated,
    login: vi.fn(),
    logout: vi.fn(),
    token: isAuthenticated ? 'test-token' : null,
    handleAuthError: vi.fn(),
  } as unknown as ReturnType<typeof useTwitchAuth>)
}

function renderStatsRow() {
  return render(
    <AppProvider>
      <StatsRow />
    </AppProvider>,
  )
}

describe('StatsRow', () => {
  beforeEach(() => {
    setAuth(true)
  })

  it('renders without crashing with empty channel data', () => {
    renderStatsRow()
    // The component should render four stat cards
    expect(screen.getByText('Clips')).toBeInTheDocument()
  })

  it('renders all stat labels', () => {
    renderStatsRow()
    expect(screen.getByText('Clips')).toBeInTheDocument()
    expect(screen.getByText('Hours Streamed')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.getByText('Engagement')).toBeInTheDocument()
  })

  it('renders stat values from mocked hooks', () => {
    renderStatsRow()
    // totalClips = 0 -> "0", uniqueGames = 0 -> "0" (multiple "0" elements)
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1)
    // totalHoursStreamed = 0 -> "0.0", clipsPerStreamHour = 0 -> "0.0"
    expect(screen.getAllByText('0.0').length).toBeGreaterThanOrEqual(2)
  })

  it('renders detail text from mocked hooks', () => {
    renderStatsRow()
    expect(screen.getByText('0 unique clippers')).toBeInTheDocument()
    expect(screen.getByText('0 VODs total')).toBeInTheDocument()
    expect(screen.getByText('One-trick')).toBeInTheDocument()
    expect(screen.getByText('clips/hour')).toBeInTheDocument()
  })

  it('renders populated stats when hooks return data', async () => {
    const { useClipStats } = await import('../../../hooks/useClipStats')
    const { useDerivedStats } = await import('../../../hooks/useDerivedStats')

    vi.mocked(useClipStats).mockReturnValue({
      totalClips: 150,
      totalViews: 500000,
      topClips: [{ view_count: 100000 } as never],
      topClippers: [],
      uniqueClippers: 42,
      gameBreakdown: [],
      avgViewsPerClip: 3333,
    })

    vi.mocked(useDerivedStats).mockReturnValue({
      vodStats: {
        totalHoursStreamed: 320.5,
        totalVODs: 80,
        avgStreamLength: 4.0,
        mostWatchedVOD: null,
      },
      diversity: {
        uniqueGames: 12,
        diversityLabel: 'Variety',
        totalVODsAnalyzed: 50,
        gameDistribution: [],
      },
      clipEngagement: {
        clipsPerStreamHour: 2.3,
        avgViewsPerClip: 3333,
        uniqueClipperCount: 42,
      },
      growth: {
        clipCreationRate: 8,
        vodViewTrend: 1.2,
        clipViewVelocity: 0,
      },
    })

    renderStatsRow()
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('42 unique clippers')).toBeInTheDocument()
    expect(screen.getByText('320.5')).toBeInTheDocument()
    expect(screen.getByText('80 VODs total')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Variety')).toBeInTheDocument()
  })
  describe('when logged out', () => {
    beforeEach(() => {
      setAuth(false)
    })

    it('does not render zeroed stat cards', () => {
      renderStatsRow()
      expect(screen.queryByText('Clips')).not.toBeInTheDocument()
      expect(screen.queryByText('Hours Streamed')).not.toBeInTheDocument()
      expect(screen.queryByText('Engagement')).not.toBeInTheDocument()
      // The specific lie: a big "0.0" that reads as a real measurement.
      expect(screen.queryByText('0.0')).not.toBeInTheDocument()
    })

    it('renders a connect prompt instead', () => {
      renderStatsRow()
      expect(
        screen.getByRole('button', { name: /connect twitch/i }),
      ).toBeInTheDocument()
      expect(screen.getByText(/channel stats/i)).toBeInTheDocument()
      expect(
        screen.getByText(/clips, VODs and engagement/i),
      ).toBeInTheDocument()
    })

    it('calls login when the connect button is clicked', async () => {
      const user = userEvent.setup()
      const login = vi.fn()
      mockedUseTwitchAuth.mockReturnValue({
        isAuthenticated: false,
        login,
        logout: vi.fn(),
        token: null,
        handleAuthError: vi.fn(),
      } as unknown as ReturnType<typeof useTwitchAuth>)

      renderStatsRow()
      await user.click(screen.getByRole('button', { name: /connect twitch/i }))
      expect(login).toHaveBeenCalledOnce()
    })
  })
})
