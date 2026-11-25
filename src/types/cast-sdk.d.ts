// The parts of Google's Cast SDKs that PRISM uses, and nothing else. `cast.framework` is a different thing on the TV (the
// receiver framework) and in PRISM's own page (the sender framework); the two never run in one page.

declare namespace cast.framework {
  // ── The receiver (the TV page) ─────────────────────────────────────────────

  class PlayerManager {
    addEventListener(type: string, listener: (event: { endedReason?: string }) => void): void
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
    const EndedReason: { END_OF_STREAM: string; STOPPED: string; INTERRUPTED: string }
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
}
