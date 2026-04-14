import { render, screen } from '@testing-library/react'
import { AppProvider } from '../../../contexts/AppContext'
import StatsRow from '../StatsRow'

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

function renderStatsRow() {
  return render(
    <AppProvider>
      <StatsRow />
    </AppProvider>,
  )
}

describe('StatsRow', () => {
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
})
