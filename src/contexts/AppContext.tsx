import { createContext, useContext, useReducer, type ReactNode } from 'react'
import type { URLDetectionResult, PlayerEngine } from '../lib/urlDetection'
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

export type FollowingSort = 'live-first' | 'alpha' | 'viewers'

const FOLLOWING_SORT_STORAGE_KEY = 'prism_following_sort'

function loadFollowingSort(): FollowingSort {
  if (typeof localStorage === 'undefined') return 'live-first'
  const stored = localStorage.getItem(FOLLOWING_SORT_STORAGE_KEY)
  if (stored === 'live-first' || stored === 'alpha' || stored === 'viewers') {
    return stored
  }
  return 'live-first'
}

export interface AppState {
  auth: {
    token: string | null
    isAuthenticated: boolean
    /** The authenticated user's own profile, populated after login. */
    user: TwitchUser | null
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
  | { type: 'PLAY_URL'; url: string; detection: URLDetectionResult }
  | { type: 'SET_ENGINE'; engine: PlayerEngine; fallbackStep: number }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'SET_DISPLAY_MODE'; mode: AppState['displayMode'] }
  | { type: 'CLEAR_ERROR' }
  | { type: 'GO_HOME' }
  | { type: 'OPEN_NAV_PANEL'; panel: NavPanelId }
  | { type: 'CLOSE_NAV_PANEL' }
  | { type: 'TOGGLE_NAV_PANEL'; panel: NavPanelId }
  | { type: 'SET_FOLLOWING_SORT'; sort: FollowingSort }
  | { type: 'OPEN_CATEGORY_PANEL'; category: string }

const initialState: AppState = {
  auth: { token: null, isAuthenticated: false, user: null },
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
    debugMode: true,
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
        auth: { ...state.auth, token: action.token, isAuthenticated: true },
      }
    case 'LOGIN_USER_LOADED':
      return { ...state, auth: { ...state.auth, user: action.user } }
    case 'LOGOUT':
    case 'TOKEN_EXPIRED':
      return {
        ...state,
        auth: { token: null, isAuthenticated: false, user: null },
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
      const displayMode: 'streamer' | 'chatter' =
        isLive || profile.broadcaster_type !== '' ? 'streamer' : 'chatter'
      return {
        ...state,
        loading: false,
        channel: { ...action.payload, isLive },
        displayMode,
      }
    }
    case 'LOAD_CHANNEL_ERROR':
      return { ...state, loading: false, error: action.error }
    case 'PLAY_URL': {
      // For non-Twitch URLs (youtube, hls, dash, direct) and Twitch
      // clips/VODs pasted without a channel context, flip to 'video'
      // mode so PlayerHost renders in a standalone layout. Twitch
      // stream URLs with a channelName stay on the existing path:
      // App.tsx triggers useChannelData → LOAD_CHANNEL_SUCCESS sets
      // displayMode to 'streamer'/'chatter'.
      const det = action.detection
      const isTwitchWithChannel =
        det.type === 'twitch' && !!det.metadata?.channelName
      let nextDisplayMode: AppState['displayMode']
      if (isTwitchWithChannel) {
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
    case 'SET_DISPLAY_MODE':
      return { ...state, displayMode: action.mode }
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
        localStorage.setItem(FOLLOWING_SORT_STORAGE_KEY, action.sort)
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its context
export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
