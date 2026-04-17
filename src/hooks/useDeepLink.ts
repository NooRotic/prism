import { useEffect, useRef } from 'react'
import { useApp } from '../contexts/AppContext'
import { detectURLType } from '../lib/urlDetection'
import type { NavPanelId } from '../contexts/AppContext'

/**
 * URL deep linking — read-on-mount + write-on-change.
 *
 * Supported query params:
 *   ?channel=MapleTakes        → load Twitch channel
 *   ?url=<encoded URL>         → play URL directly (YouTube, HLS, DASH)
 *   ?view=stats                → open Your Stats panel
 *   ?view=following            → open Following panel
 *   ?view=category&category=X  → open CategoryPanel for game X
 *
 * Composable: ?channel=MapleTakes&view=stats opens the channel AND
 * the stats panel.
 *
 * Uses history.replaceState (not pushState) so the URL updates
 * without creating browser history entries for every state change.
 */

const VIEW_TO_PANEL: Record<string, NavPanelId> = {
  stats: 'your-stats',
  following: 'following',
  category: 'category',
}

function getBasePath(): string {
  // Vite's base path — matches vite.config.ts `base`
  return import.meta.env.BASE_URL || '/twitch-glaze-me/'
}

/**
 * Read URL params on mount and dispatch the corresponding actions.
 * Only runs once — the ref guard prevents re-reads when the URL
 * is updated by the write side.
 */
export function useDeepLinkRead() {
  const { dispatch } = useApp()
  const hasRead = useRef(false)

  useEffect(() => {
    if (hasRead.current) return
    hasRead.current = true

    const params = new URLSearchParams(window.location.search)
    if (!params.toString()) return

    // Defer dispatches by one frame so the initial layout is
    // committed before state changes trigger player mounts.
    requestAnimationFrame(() => {
      // ?channel=X → load Twitch channel
      const channel = params.get('channel')
      if (channel) {
        const url = `https://twitch.tv/${channel}`
        const detection = detectURLType(url)
        dispatch({ type: 'PLAY_URL', url, detection })
      }

      // ?url=X → play arbitrary URL
      const playUrl = params.get('url')
      if (playUrl && !channel) {
        const detection = detectURLType(playUrl)
        dispatch({ type: 'PLAY_URL', url: playUrl, detection })
      }

      // ?view=X → open a nav panel
      const view = params.get('view')
      if (view && view in VIEW_TO_PANEL) {
        const panel = VIEW_TO_PANEL[view]
        if (panel === 'category') {
          const category = params.get('category')
          if (category) {
            dispatch({ type: 'OPEN_CATEGORY_PANEL', category })
          }
        } else {
          dispatch({ type: 'OPEN_NAV_PANEL', panel })
        }
      }
    })
  }, [dispatch])
}

/**
 * Sync app state → URL query params via history.replaceState.
 * Runs on every relevant state change.
 */
export function useDeepLinkWrite() {
  const { state } = useApp()

  useEffect(() => {
    const params = new URLSearchParams()

    // Channel
    const channelName = state.channel.profile?.login
    if (channelName && state.displayMode !== 'idle') {
      params.set('channel', channelName)
    }

    // Direct URL (non-Twitch)
    if (
      state.displayMode === 'video' &&
      state.player.currentUrl &&
      state.player.detection?.type !== 'twitch'
    ) {
      params.set('url', state.player.currentUrl)
    }

    // Nav panel
    const panelOpen = state.navPanel.open
    if (panelOpen === 'your-stats') {
      params.set('view', 'stats')
    } else if (panelOpen === 'following') {
      params.set('view', 'following')
    } else if (panelOpen === 'category' && state.navPanel.category) {
      params.set('view', 'category')
      params.set('category', state.navPanel.category)
    }

    const search = params.toString()
    const newUrl = getBasePath() + (search ? `?${search}` : '')

    // Only update if changed to avoid unnecessary history entries
    if (window.location.pathname + window.location.search !== newUrl) {
      history.replaceState(null, '', newUrl)
    }
  }, [
    state.channel.profile?.login,
    state.displayMode,
    state.player.currentUrl,
    state.player.detection?.type,
    state.navPanel.open,
    state.navPanel.category,
  ])
}
