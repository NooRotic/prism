// The parts of Google's Cast SDKs that PRISM uses, and nothing else. `cast.framework` is a different thing on the TV (the
// receiver framework) and in PRISM's own page (the sender framework); the two never run in one page.

declare namespace cast.framework {
  // ── The receiver (the TV page) ─────────────────────────────────────────────

  class PlayerManager {
    addEventListener(type: string, listener: (event: { endedReason?: string; detailedErrorCode?: number }) => void): void
    setMessageInterceptor<T>(type: string, interceptor: (data: T) => unknown): void
    load(request: messages.LoadRequestData): Promise<void>
    stop(): void
    seek(seconds: number): void
    getPlayerState(): string
    getLiveSeekableRange(): { start?: number; end?: number } | null
  }

  class CastReceiverContext {
    static getInstance(): CastReceiverContext
    getPlayerManager(): PlayerManager
    start(options?: CastReceiverOptions): CastReceiverContext
    stop(): void
    addCustomMessageListener(namespace: string, listener: (event: { data: unknown; senderId: string }) => void): void
    sendCustomMessage(namespace: string, senderId: string | undefined, data: unknown): void
    addEventListener(type: string, listener: (event: { senderId?: string }) => void): void
  }

  class CastReceiverOptions {
    customNamespaces?: Record<string, string>
    useShakaForHls?: boolean
    playbackConfig?: PlaybackConfig
  }

  class PlaybackConfig {
    initialBandwidth?: number
    autoResumeDuration?: number
    shakaConfig?: object
  }

  namespace events {
    const EventType: { ERROR: string; PLAYER_LOADING: string; LOADED_METADATA: string; MEDIA_FINISHED: string }
    const EndedReason: { END_OF_STREAM: string; STOPPED: string; SENDER_STOPPED: string }
    const DetailedErrorCode: { IMAGE_ERROR: number; LOAD_INTERRUPTED: number; MEDIA_ERROR_MESSAGE: number }
  }

  namespace system {
    const EventType: { READY: string; SENDER_CONNECTED: string }
    const MessageType: { JSON: string }
  }

  namespace messages {
    const MessageType: { LOAD: string; PLAY: string }
    const PlayerState: { IDLE: string; PAUSED: string; PLAYING: string }
    const StreamType: { LIVE: string; BUFFERED: string }
    const ErrorType: { LOAD_FAILED: string }
    class Image {
      constructor(url: string)
      url: string
    }
    class GenericMediaMetadata {
      title?: string
      images?: Image[]
    }
    class MediaInformation {
      contentId: string
      contentUrl?: string
      contentType: string
      streamType?: string
      metadata?: GenericMediaMetadata
      customData?: unknown
    }
    class LoadRequestData {
      autoplay?: boolean
      media: MediaInformation
    }
    class ErrorData {
      constructor(type: string)
    }
  }

  // ── The sender (PRISM's own page) ──────────────────────────────────────────

  class CastContext {
    static getInstance(): CastContext
    setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void
    addEventListener(type: string, listener: (event: { castState?: string; sessionState?: string }) => void): void
    getCastState(): string
    getCurrentSession(): CastSession | null
    requestSession(): Promise<unknown>
    endCurrentSession(stopCasting: boolean): void
  }

  class CastSession {
    getCastDevice(): { friendlyName: string }
    addMessageListener(namespace: string, listener: (namespace: string, message: string) => void): void
    sendMessage(namespace: string, data: unknown): Promise<unknown>
    loadMedia(request: chrome.cast.media.LoadRequest): Promise<unknown>
  }

  class RemotePlayer {}

  class RemotePlayerController {
    constructor(player: RemotePlayer)
    playOrPause(): void
  }

  const CastContextEventType: { CAST_STATE_CHANGED: string; SESSION_STATE_CHANGED: string }
  const CastState: { NO_DEVICES_AVAILABLE: string }
  const SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDED: string; SESSION_START_FAILED: string }
}

declare namespace chrome.cast {
  const AutoJoinPolicy: { TAB_AND_ORIGIN_SCOPED: string }
  class Image {
    constructor(url: string)
    url: string
  }
  namespace media {
    const StreamType: { LIVE: string; BUFFERED: string }
    class GenericMediaMetadata {
      title?: string
      images?: Image[]
    }
    class MediaInfo {
      constructor(contentId: string, contentType: string)
      contentUrl?: string
      streamType?: string
      metadata?: GenericMediaMetadata
      customData?: unknown
    }
    class LoadRequest {
      constructor(media: MediaInfo)
      autoplay?: boolean
    }
  }
}
