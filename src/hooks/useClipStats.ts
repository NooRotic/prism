import { useMemo } from 'react'
import type { TwitchClip, TwitchGame } from '../types/twitch'

interface ClipperInfo {
  name: string
  count: number
  totalViews: number
}

interface GameBreakdown {
  gameId: string
  gameName: string
  boxArtUrl: string
  clipCount: number
  totalViews: number
}

export interface ClipStats {
  totalClips: number
  totalViews: number
  topClips: TwitchClip[]
  topClippers: ClipperInfo[]
  uniqueClippers: number
  gameBreakdown: GameBreakdown[]
  avgViewsPerClip: number
}

export function useClipStats(
  clips: TwitchClip[],
  games: Map<string, TwitchGame>,
): ClipStats {
  return useMemo(() => {
    const totalClips = clips.length
    const totalViews = clips.reduce((sum, c) => sum + c.view_count, 0)
    const avgViewsPerClip = totalClips > 0 ? totalViews / totalClips : 0

    // Top clips by view count
    const topClips = [...clips]
      .sort((a, b) => b.view_count - a.view_count)
      .slice(0, 10)

    // Clipper aggregation
    const clipperMap = new Map<string, { count: number; totalViews: number }>()
    for (const clip of clips) {
      const name = clip.creator_name
      const existing = clipperMap.get(name)
      if (existing) {
        existing.count++
        existing.totalViews += clip.view_count
      } else {
        clipperMap.set(name, { count: 1, totalViews: clip.view_count })
      }
    }

    const topClippers: ClipperInfo[] = [...clipperMap.entries()]
      .map(([name, data]) => ({ name, count: data.count, totalViews: data.totalViews }))
      .sort((a, b) => b.count - a.count)

    const uniqueClippers = clipperMap.size

    // Game breakdown
    const gameMap = new Map<string, { clipCount: number; totalViews: number }>()
    for (const clip of clips) {
      if (!clip.game_id) continue
      const existing = gameMap.get(clip.game_id)
      if (existing) {
        existing.clipCount++
        existing.totalViews += clip.view_count
      } else {
        gameMap.set(clip.game_id, { clipCount: 1, totalViews: clip.view_count })
      }
    }

    const gameBreakdown: GameBreakdown[] = [...gameMap.entries()]
      .map(([gameId, data]) => {
        const game = games.get(gameId)
        return {
          gameId,
          gameName: game?.name ?? 'Unknown',
          boxArtUrl: game?.box_art_url ?? '',
          clipCount: data.clipCount,
          totalViews: data.totalViews,
        }
      })
      .sort((a, b) => b.clipCount - a.clipCount)

    return {
      totalClips,
      totalViews,
      topClips,
      topClippers,
      uniqueClippers,
      gameBreakdown,
      avgViewsPerClip,
    }
  }, [clips, games])
}
