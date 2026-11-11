import { createContext, useContext, useReducer, type ReactNode } from 'react'
import type { URLDetectionResult, PlayerEngine } from '../lib/urlDetection'
import { getStoredToken } from '../lib/twitchAuth'
import type {
  TwitchUser,
  TwitchChannel,
  TwitchStream,
  TwitchClip,
  TwitchVideo,
  TwitchEmote,
  TwitchBadge,
  TwitchGame,
} from '../types/twitch'

export interface SearchEntry {
  query: string
  type: string
  timestamp: number
}

export type NavPanelId = 'following' | 'your-stats' | 'category'

export type FollowingSortMode = 'live-first' | 'alpha' | 'viewers'
export type FollowingSortDir = 'asc' | 'desc'
export interface FollowingSort {
  mode: FollowingSortMode
  dir: FollowingSortDir
}

const SORT_DEFAULTS: Record<FollowingSortMode, FollowingSortDir> = {
  'live-first': 'desc',
  alpha: 'asc',
  viewers: 'desc',
}

import { STORAGE_KEYS } from '../config/storageKeys'

const FOLLOWING_SORT_STORAGE_KEY = STORAGE_KEYS.LOCAL_FOLLOWING_SORT

function loadFollowingSort(): FollowingSort {
  if (typeof localStorage === 'undefined') return { mode: 'live-first', dir: 'desc' }
  const stored = localStorage.getItem(FOLLOWING_SORT_STORAGE_KEY)
  if (!stored) return { mode: 'live-first', dir: 'desc' }
  // Handle legacy bare values from before asc/desc toggle
  if (stored === 'live-first' || stored === 'alpha' || stored === 'viewers') {
    return { mode: stored, dir: SORT_DEFAULTS[stored] }
  }
  // New format: "mode:dir"
  const [mode, dir] = stored.split(':')
  if (
    (mode === 'live-first' || mode === 'alpha' || mode === 'viewers') &&
    (dir === 'asc' || dir === 'desc')
  ) {
    return { mode, dir }
  }
  return { mode: 'live-first', dir: 'desc' }
}

export interface AppState {
  auth: {
    token: string | null
    isAuthenticated: boolean
    /** The authenticated user's own profile, populated after login. */
    user: TwitchUser | null
    /** True when loading the profile failed for a reason other than an expired session. */
    profileError: boolean
    /** True when the viewer was signed out because their Twitch session expired. */
    expired: boolean
  }
  search: { query: string; history: SearchEntry[] }
  channel: {
    profile: TwitchUser | null
    channelInfo: TwitchChannel | null
    stream: TwitchStream | null
    clips: TwitchClip[]
    videos: TwitchVideo[]
    emotes: TwitchEmote[]
    badges: TwitchBadge[]
    games: Map<string, TwitchGame>
    isLive: boolean
  }
  player: {
    currentUrl: string
    detection: URLDetectionResult | null
    activeEngine: PlayerEngine
    fallbackStep: number
    debugMode: boolean
  }
  /** Controls the header nav slide-down panel (following, etc.). */
  navPanel: {
    open: NavPanelId | null
    followingSort: FollowingSort
    /**
     * The game/category name for the Category panel. Set when the
     * user clicks a game name in ProfileSidebar — the panel fetches
     * live streams for this category from Helix.
     */
    category: string | null
  }
  displayMode: 'idle' | 'streamer' | 'chatter' | 'video'
  loading: boolean
  error: string | null
}

type Action =
  | { type: 'LOGIN'; token: string }
  | { type: 'LOGIN_USER_LOADED'; user: TwitchUser }
  | { type: 'LOGIN_USER_FAILED' }
  | { type: 'LOGIN_USER_RETRY' }
  | { type: 'LOGOUT' }
  | { type: 'TOKEN_EXPIRED' }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'ADD_HISTORY'; entry: SearchEntry }
  | { type: 'LOAD_CHANNEL_START' }
  | {
      type: 'LOAD_CHANNEL_SUCCESS'
      payload: {
        profile: TwitchUser
        channelInfo: TwitchChannel
        stream: TwitchStream | null
        clips: TwitchClip[]
        videos: TwitchVideo[]
        emotes: TwitchEmote[]
        badges: TwitchBadge[]
        games: Map<string, TwitchGame>
      }
    }
  | { type: 'LOAD_CHANNEL_ERROR'; error: string }
  /** The loaded channel's live status was checked again: its stream now, or null when it is offline. */
  | { type: 'UPDATE_CHANNEL_STREAM'; stream: TwitchStream | null }
  | { type: 'PLAY_URL'; url: string; detection: URLDetectionResult }
  | { type: 'SET_ENGINE'; engine: PlayerEngine; fallbackStep: number }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'GO_HOME' }
  | { type: 'OPEN_NAV_PANEL'; panel: NavPanelId }
  | { type: 'CLOSE_NAV_PANEL' }
  | { type: 'TOGGLE_NAV_PANEL'; panel: NavPanelId }
  | { type: 'SET_FOLLOWING_SORT'; sort: FollowingSort }
  | { type: 'OPEN_CATEGORY_PANEL'; category: string }

/** A channel that is live or has a broadcaster tier is a streamer; any other is a chatter. */
function channelDisplayMode(
  isLive: boolean,
  profile: TwitchUser,
): 'streamer' | 'chatter' {
  return isLive || profile.broadcaster_type !== '' ? 'streamer' : 'chatter'
}

const initialState: AppState = {
  auth: { token: null, isAuthenticated: false, user: null, profileError: false, expired: false },
  search: { query: '', history: [] },
  channel: {
    profile: null,
    channelInfo: null,
    stream: null,
    clips: [],
    videos: [],
    emotes: [],
    badges: [],
    games: new Map(),
    isLive: false,
  },
  player: {
    currentUrl: '',
    detection: null,
    activeEngine: 'twitch-sdk',
    fallbackStep: 0,
    debugMode: false,
  },
  navPanel: {
    open: null,
    followingSort: loadFollowingSort(),
    category: null,
  },
  displayMode: 'idle',
  loading: false,
  error: null,
}

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN':
      return {
        ...state,
        auth: {
          ...state.auth,
          token: action.token,
          isAuthenticated: true,
          profileError: false,
          expired: false,
        },
      }
    case 'LOGIN_USER_LOADED':
      return { ...state, auth: { ...state.auth, user: action.user, profileError: false } }
    case 'LOGIN_USER_FAILED':
      return { ...state, auth: { ...state.auth, profileError: true } }
    case 'LOGIN_USER_RETRY':
      return { ...state, auth: { ...state.auth, profileError: false } }
    case 'LOGOUT':
    case 'TOKEN_EXPIRED':
      return {
        ...state,
        // An expired session is remembered so the signed-out page can say so.
        auth: {
          token: null,
          isAuthenticated: false,
          user: null,
          profileError: false,
          expired: action.type === 'TOKEN_EXPIRED',
        },
        // Close any open nav panel since it requires auth
        navPanel: { ...state.navPanel, open: null },
      }
    case 'SET_QUERY':
      return { ...state, search: { ...state.search, query: action.query } }
    case 'ADD_HISTORY': {
      const history = [action.entry, ...state.search.history.filter(
        (h) => h.query !== action.entry.query,
      )].slice(0, 20)
      return { ...state, search: { ...state.search, history } }
    }
    case 'LOAD_CHANNEL_START':
      return { ...state, loading: true, error: null }
    case 'LOAD_CHANNEL_SUCCESS': {
      const { stream, profile } = action.payload
      const isLive = stream?.type === 'live'
      const displayMode = channelDisplayMode(isLive, profile)
      return {
        ...state,
        loading: false,
        channel: { ...action.payload, isLive },
        displayMode,
      }
    }
    case 'LOAD_CHANNEL_ERROR':
      return { ...state, loading: false, error: action.error }
    case 'UPDATE_CHANNEL_STREAM': {
      const { profile } = state.channel
      if (profile === null) return state
      const isLive = action.stream?.type === 'live'
      // A quiet poll (offline, still offline) must not hand every consumer a new state.
      if (action.stream === state.channel.stream && isLive === state.channel.isLive) return state
      // Only the streamer/chatter modes follow live status; video mode and idle stay as they are.
      const displayMode =
        state.displayMode === 'streamer' || state.displayMode === 'chatter'
          ? channelDisplayMode(isLive, profile)
          : state.displayMode
      return { ...state, channel: { ...state.channel, stream: action.stream, isLive }, displayMode }
    }
    case 'PLAY_URL': {
      // For non-Twitch URLs (youtube, hls, dash, direct) and Twitch
      // clips/VODs pasted without a channel context, flip to 'video'
      // mode so PlayerHost renders in a standalone layout. Twitch
      // stream URLs with a channelName stay on the existing path:
      // App.tsx triggers useChannelData → LOAD_CHANNEL_SUCCESS sets
      // displayMode to 'streamer'/'chatter'.
      const det = action.detection
      const channelName =
        det.type === 'twitch' ? det.metadata?.channelName : undefined
      const loadedProfile = state.channel.profile
      let nextDisplayMode: AppState['displayMode']
      if (
        channelName &&
        state.displayMode === 'video' &&
        loadedProfile &&
        loadedProfile.login.toLowerCase() === channelName.toLowerCase()
      ) {
        // Back to the live stream of the channel that is already loaded, after
        // one of its clips or VODs put us in video mode. Its data is still
        // here and nothing reloads it, so restore its layout rather than
        // leaving the page stuck in video mode.
        nextDisplayMode = channelDisplayMode(state.channel.isLive, loadedProfile)
      } else if (channelName) {
        // Preserve streamer/chatter when switching content within a
        // channel. But if we're idle, jump to streamer so ChannelLayout
        // renders immediately (loading overlay covers the data fetch).
        nextDisplayMode =
          state.displayMode === 'idle' ? 'streamer' : state.displayMode
      } else {
        nextDisplayMode = 'video'
      }
      return {
        ...state,
        displayMode: nextDisplayMode,
        navPanel: { ...state.navPanel, open: null },
        player: {
          ...state.player,
          currentUrl: action.url,
          detection: action.detection,
          fallbackStep: 0,
        },
      }
    }
    case 'SET_ENGINE':
      return {
        ...state,
        player: {
          ...state.player,
          activeEngine: action.engine,
          fallbackStep: action.fallbackStep,
        },
      }
    case 'TOGGLE_DEBUG':
      return {
        ...state,
        player: { ...state.player, debugMode: !state.player.debugMode },
      }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    case 'GO_HOME':
      // Reset the app to the idle/landing state without touching auth or
      // search history. Preserves the user's debug toggle since that's a
      // developer affordance, not a per-channel piece of state.
      return {
        ...state,
        player: {
          currentUrl: '',
          detection: null,
          activeEngine: 'twitch-sdk',
          fallbackStep: 0,
          debugMode: state.player.debugMode,
        },
        channel: {
          profile: null,
          channelInfo: null,
          stream: null,
          clips: [],
          videos: [],
          emotes: [],
          badges: [],
          games: new Map(),
          isLive: false,
        },
        search: { ...state.search, query: '' },
        // Close any open nav panel on home navigation
        navPanel: { ...state.navPanel, open: null },
        displayMode: 'idle',
        loading: false,
        error: null,
      }
    case 'OPEN_NAV_PANEL':
      return { ...state, navPanel: { ...state.navPanel, open: action.panel } }
    case 'CLOSE_NAV_PANEL':
      return { ...state, navPanel: { ...state.navPanel, open: null } }
    case 'TOGGLE_NAV_PANEL':
      return {
        ...state,
        navPanel: {
          ...state.navPanel,
          open: state.navPanel.open === action.panel ? null : action.panel,
        },
      }
    case 'SET_FOLLOWING_SORT':
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(FOLLOWING_SORT_STORAGE_KEY, `${action.sort.mode}:${action.sort.dir}`)
      }
      return {
        ...state,
        navPanel: { ...state.navPanel, followingSort: action.sort },
      }
    case 'OPEN_CATEGORY_PANEL':
      return {
        ...state,
        navPanel: {
          ...state.navPanel,
          open: 'category',
          category: action.category,
        },
      }
    default:
      return state
  }
}

const AppContext = createContext<{
  state: AppState
  dispatch: React.Dispatch<Action>
} | null>(null)

/**
 * Starting state for the reducer. A stored token means the user is signed in
 * from the very first render, so nothing flashes "Connect Twitch" on a reload.
 */
function initAppState(base: AppState): AppState {
  const token = getStoredToken()
  return token ? { ...base, auth: { ...base.auth, token, isAuthenticated: true } } : base
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState, initAppState)
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its context
export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
