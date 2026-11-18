/** Loads YouTube's IFrame Player API once and hands back the global. Minimal local types, no @types package. */
export interface YTPlayer {
  loadPlaylist(o: { list?: string; listType?: 'playlist'; playlist?: string[]; index?: number }): void
  cuePlaylist(o: { list?: string; listType?: 'playlist' }): void
  pauseVideo(): void
  nextVideo(): void
  previousVideo(): void
  playVideoAt(i: number): void
  getPlaylist(): string[] | null
  getPlaylistIndex(): number
  getVideoData(): { video_id: string; title: string; author: string; list?: string }
  getCurrentTime(): number
  getDuration(): number
  setShuffle(on: boolean): void
  setLoop(on: boolean): void
  mute(): void
  unMute(): void
  destroy(): void
}

export interface YTNamespace {
  Player: new (
    el: HTMLElement,
    o: {
      width: string
      height: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: () => void
        onStateChange?: (e: { data: number }) => void
        onError?: (e: { data: number }) => void
        onApiChange?: () => void
      }
    },
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let loading: Promise<YTNamespace> | null = null

export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (window.YT) resolve(window.YT)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.onerror = () => {
      loading = null
      reject(new Error('Could not load the YouTube IFrame API'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export const PLAYER_STATES: Record<number, string> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
}

export const PLAYER_ERRORS: Record<number, string> = {
  2: 'bad parameter / id',
  5: 'HTML5 player error',
  100: 'video not found or private',
  101: 'embedding not allowed',
  150: 'embedding not allowed',
}
