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

export interface AppState {
  auth: { token: string | null; isAuthenticated: boolean }
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
  displayMode: 'idle' | 'streamer' | 'chatter'
  loading: boolean
  error: string | null
}

type Action =
  | { type: 'LOGIN'; token: string }
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
  | { type: 'SET_DISPLAY_MODE'; mode: 'idle' | 'streamer' | 'chatter' }
  | { type: 'CLEAR_ERROR' }

const initialState: AppState = {
  auth: { token: null, isAuthenticated: false },
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
  displayMode: 'idle',
  loading: false,
  error: null,
}

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, auth: { token: action.token, isAuthenticated: true } }
    case 'LOGOUT':
    case 'TOKEN_EXPIRED':
      return { ...state, auth: { token: null, isAuthenticated: false } }
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
    case 'PLAY_URL':
      return {
        ...state,
        player: {
          ...state.player,
          currentUrl: action.url,
          detection: action.detection,
          fallbackStep: 0,
        },
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
