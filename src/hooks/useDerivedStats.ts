import { useMemo } from 'react'
import type {
  TwitchClip,
  TwitchVideo,
  TwitchChannel,
  TwitchGame,
} from '../types/twitch'

// --- Duration parser: "1h2m3s" -> hours as number ---

function parseTwitchDuration(duration: string): number {
  let hours = 0
  let minutes = 0
  let seconds = 0

  const hMatch = duration.match(/(\d+)h/)
  const mMatch = duration.match(/(\d+)m/)
  const sMatch = duration.match(/(\d+)s/)

  if (hMatch) hours = parseInt(hMatch[1], 10)
  if (mMatch) minutes = parseInt(mMatch[1], 10)
  if (sMatch) seconds = parseInt(sMatch[1], 10)

  return hours + minutes / 60 + seconds / 3600
}

// --- Types ---

type DiversityLabel = 'One-trick' | 'Focused' | 'Variety' | 'Ultra-variety'

interface GrowthIndicators {
  clipViewVelocity: number
  vodViewTrend: number
  clipCreationRate: number
}

interface GameDistributionEntry {
  gameName: string
  percentage: number
  count: number
}

interface ContentDiversityIndex {
  uniqueGames: number
  totalVODsAnalyzed: number
  gameDistribution: GameDistributionEntry[]
  diversityLabel: DiversityLabel
}

interface ClipEngagement {
  clipsPerStreamHour: number
  uniqueClipperCount: number
  avgViewsPerClip: number
}

interface VODStats {
  totalVODs: number
  totalHoursStreamed: number
  avgStreamLength: number
  mostWatchedVOD: TwitchVideo | null
}

export interface DerivedStats {
  growth: GrowthIndicators
  diversity: ContentDiversityIndex
  clipEngagement: ClipEngagement
  vodStats: VODStats
}

interface UseDerivedStatsInput {
  clips: TwitchClip[]
  videos: TwitchVideo[]
  channelInfo: TwitchChannel | null
  games: Map<string, TwitchGame>
}

export function useDerivedStats({
  clips,
  videos,
  channelInfo,
  games,
}: UseDerivedStatsInput): DerivedStats {
  return useMemo(() => {
    // ===== Growth Indicators =====
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

    // Clip view velocity: avg views per day for clips in last 30 days
    const recentClips = clips.filter(
      (c) => new Date(c.created_at).getTime() > thirtyDaysAgo,
    )
    let clipViewVelocity = 0
    if (recentClips.length > 0) {
      const totalRecentViews = recentClips.reduce((sum, c) => sum + c.view_count, 0)
      // Days spanned by recent clips
      const oldestRecent = Math.min(
        ...recentClips.map((c) => new Date(c.created_at).getTime()),
      )
      const daySpan = Math.max((now - oldestRecent) / (1000 * 60 * 60 * 24), 1)
      clipViewVelocity = totalRecentViews / daySpan
    }

    // VOD view trend: avg views of last 10 vs previous 10
    const sortedVods = [...videos].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    const last10 = sortedVods.slice(0, 10)
    const prev10 = sortedVods.slice(10, 20)
    const avgLast10 =
      last10.length > 0
        ? last10.reduce((s, v) => s + v.view_count, 0) / last10.length
        : 0
    const avgPrev10 =
      prev10.length > 0
        ? prev10.reduce((s, v) => s + v.view_count, 0) / prev10.length
        : 0
    // Positive means growth, expressed as a ratio (1.0 = no change)
    const vodViewTrend = avgPrev10 > 0 ? avgLast10 / avgPrev10 : 0

    // Clip creation rate: clips per month
    let clipCreationRate = 0
    if (clips.length >= 2) {
      const clipDates = clips.map((c) => new Date(c.created_at).getTime())
      const oldest = Math.min(...clipDates)
      const newest = Math.max(...clipDates)
      const monthSpan = Math.max((newest - oldest) / (1000 * 60 * 60 * 24 * 30), 1)
      clipCreationRate = clips.length / monthSpan
    } else if (clips.length === 1) {
      clipCreationRate = 1
    }

    const growth: GrowthIndicators = {
      clipViewVelocity,
      vodViewTrend,
      clipCreationRate,
    }

    // ===== Content Diversity Index =====
    const recentVODs = sortedVods.slice(0, 20)
    // TwitchVideo doesn't carry game_id, so we derive game diversity from clips
    // and use last 20 VODs count for totalVODsAnalyzed.

    // For game distribution, use the games map which was built from clip game_ids
    const gameCountMap = new Map<string, number>()
    for (const clip of clips) {
      if (!clip.game_id) continue
      gameCountMap.set(clip.game_id, (gameCountMap.get(clip.game_id) ?? 0) + 1)
    }

    const uniqueGames = gameCountMap.size
    const totalClipsWithGame = [...gameCountMap.values()].reduce((s, c) => s + c, 0)

    const gameDistribution: GameDistributionEntry[] = [...gameCountMap.entries()]
      .map(([gameId, count]) => ({
        gameName: games.get(gameId)?.name ?? 'Unknown',
        percentage: totalClipsWithGame > 0 ? (count / totalClipsWithGame) * 100 : 0,
        count,
      }))
      .sort((a, b) => b.count - a.count)

    let diversityLabel: DiversityLabel
    if (uniqueGames <= 1) {
      diversityLabel = 'One-trick'
    } else if (uniqueGames <= 3) {
      diversityLabel = 'Focused'
    } else if (uniqueGames <= 7) {
      diversityLabel = 'Variety'
    } else {
      diversityLabel = 'Ultra-variety'
    }

    const diversity: ContentDiversityIndex = {
      uniqueGames,
      totalVODsAnalyzed: recentVODs.length,
      gameDistribution,
      diversityLabel,
    }

    // ===== Clip Engagement =====
    const totalVODHours = videos.reduce(
      (sum, v) => sum + parseTwitchDuration(v.duration),
      0,
    )
    const clipsPerStreamHour = totalVODHours > 0 ? clips.length / totalVODHours : 0

    const uniqueClipperNames = new Set(clips.map((c) => c.creator_name))
    const uniqueClipperCount = uniqueClipperNames.size

    const avgViewsPerClip =
      clips.length > 0
        ? clips.reduce((s, c) => s + c.view_count, 0) / clips.length
        : 0

    const clipEngagement: ClipEngagement = {
      clipsPerStreamHour,
      uniqueClipperCount,
      avgViewsPerClip,
    }

    // ===== VOD Stats =====
    const totalVODs = videos.length
    const totalHoursStreamed = totalVODHours
    const avgStreamLength = totalVODs > 0 ? totalHoursStreamed / totalVODs : 0

    let mostWatchedVOD: TwitchVideo | null = null
    if (videos.length > 0) {
      mostWatchedVOD = videos.reduce((best, v) =>
        v.view_count > best.view_count ? v : best,
      )
    }

    const vodStats: VODStats = {
      totalVODs,
      totalHoursStreamed,
      avgStreamLength,
      mostWatchedVOD,
    }

    return { growth, diversity, clipEngagement, vodStats }
  }, [clips, videos, channelInfo, games])
}
