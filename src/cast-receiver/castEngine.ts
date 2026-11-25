import { contentType, parseLoadData, type CastLoadData, type CastStream } from '../lib/cast/messages'
import type { CastEngine, EngineSample } from '../lib/cast/tuner'

const MAX_NAME = 200
/** More than enough for loads that were asked for and have not been through the interceptor yet. */
const MAX_OWN_LOADS = 20

function isHttp(address: unknown): address is string {
  if (typeof address !== 'string') return false
  try {
    const { protocol } = new URL(address)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** Cast keeps its video inside its player element's shadow tree. */
function findVideo(root: ParentNode): HTMLVideoElement | null {
  const direct = root.querySelector('video')
  if (direct) return direct
  for (const element of root.querySelectorAll('*')) {
    const inside = element.shadowRoot && findVideo(element.shadowRoot)
    if (inside) return inside
  }
  return null
}

/** What a sender asked for, or null when its address is not one to play. */
function readRequest(media: cast.framework.messages.MediaInformation | undefined, data: CastLoadData | null): CastStream | null {
  const url = media?.contentUrl ?? media?.contentId
  if (!media || !isHttp(url)) return null
  const kind = data?.kind ?? (/dash/i.test(media.contentType ?? '') ? 'dash' : 'hls')
  const logo = media.metadata?.images?.[0]?.url
  return {
    id: data?.id ?? null,
    name: String(media.metadata?.title || 'Stream').slice(0, MAX_NAME),
    url,
    kind,
    live: data?.live ?? true,
    logo: isHttp(logo) ? logo : null,
  }
}

/** The only code that touches Cast's player. */
export function createCastEngine(manager: cast.framework.PlayerManager): CastEngine {
  const { events, messages } = cast.framework
  // Cast says PLAYER_LOADING when it begins a load, LOADED_METADATA when that one's data is there, and begins the next load
  // only when the one before has been given up (measured: up to 3.7 s for a dead address). So until PLAYER_LOADING, an error,
  // an end or a moving picture still belongs to the stream before.
  let phase: 'none' | 'asked' | 'loading' | 'ready' = 'none'
  let finished: 'ended' | 'stopped' | null = null
  let live = true
  // Cast passes its own loads through the load interceptor too. Each carries a word of its own, used once: the word can be
  // read in Cast's status, so seeing it again means a sender copied it.
  const ownLoads = new Set<string>()
  const notTheStreams = new Set([events.DetailedErrorCode.IMAGE_ERROR, events.DetailedErrorCode.LOAD_INTERRUPTED, events.DetailedErrorCode.MEDIA_ERROR_MESSAGE])
  const errors = new Set<() => void>()
  const senderLoads = new Set<(stream: CastStream, data: CastLoadData | null) => void>()

  function begin(isLive: boolean): void {
    phase = 'asked'
    finished = null
    live = isLive
  }

  manager.addEventListener(events.EventType.PLAYER_LOADING, () => {
    if (phase === 'asked') phase = 'loading'
  })
  manager.addEventListener(events.EventType.LOADED_METADATA, () => {
    if (phase === 'loading') phase = 'ready'
  })
  manager.addEventListener(events.EventType.ERROR, (event) => {
    if (event.detailedErrorCode !== undefined && notTheStreams.has(event.detailedErrorCode)) return
    if (phase === 'loading' || phase === 'ready') for (const listener of [...errors]) listener()
  })
  manager.addEventListener(events.EventType.MEDIA_FINISHED, (event) => {
    if (phase !== 'loading' && phase !== 'ready') return
    const { END_OF_STREAM, STOPPED, SENDER_STOPPED } = events.EndedReason
    if (event.endedReason === END_OF_STREAM) finished = 'ended'
    if (event.endedReason === STOPPED || event.endedReason === SENDER_STOPPED) finished = 'stopped'
  })

  manager.setMessageInterceptor<cast.framework.messages.LoadRequestData>(messages.MessageType.LOAD, (request) => {
    const raw = request.media?.customData
    const data = parseLoadData(raw)
    const stream = readRequest(request.media, data)
    const origin = typeof raw === 'object' && raw !== null ? (raw as { origin?: unknown }).origin : undefined
    const own = typeof origin === 'string' && ownLoads.delete(origin)
    if (!stream) return new messages.ErrorData(messages.ErrorType.LOAD_FAILED)
    if (own) return request
    request.media.contentUrl = stream.url
    request.media.contentType = contentType(stream.kind)
    request.media.streamType = stream.live ? messages.StreamType.LIVE : messages.StreamType.BUFFERED
    begin(stream.live)
    for (const listener of [...senderLoads]) listener(stream, data)
    return request
  })

  // A live stream picked up where it was paused may no longer have that part: go to what is on now.
  manager.setMessageInterceptor<unknown>(messages.MessageType.PLAY, (request) => {
    const edge = manager.getLiveSeekableRange()?.end
    if (live && manager.getPlayerState() === messages.PlayerState.PAUSED && typeof edge === 'number') manager.seek(edge)
    return request
  })

  return {
    // `async`, so a load Cast throws at once is a refused load like any other.
    async load(stream) {
      begin(stream.live)
      const media = new messages.MediaInformation()
      // The id, never the address: senders may show or keep it.
      media.contentId = stream.id ?? 'pasted'
      media.contentUrl = stream.url
      media.contentType = contentType(stream.kind)
      media.streamType = stream.live ? messages.StreamType.LIVE : messages.StreamType.BUFFERED
      const metadata = new messages.GenericMediaMetadata()
      metadata.title = stream.name
      if (stream.logo !== null) metadata.images = [new messages.Image(stream.logo)]
      media.metadata = metadata
      const origin = `tv-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
      ownLoads.add(origin)
      if (ownLoads.size > MAX_OWN_LOADS) ownLoads.delete([...ownLoads][0])
      media.customData = { v: 1, origin, id: stream.id, kind: stream.kind, live: stream.live, favorites: [], group: null }
      const request = new messages.LoadRequestData()
      request.autoplay = true
      request.media = media
      await manager.load(request)
    },
    stop() {
      manager.stop()
    },
    sample(): EngineSample | null {
      if (finished) return { time: 0, paused: false, ended: finished === 'ended', stopped: finished === 'stopped' }
      if (phase !== 'ready' || manager.getPlayerState() === messages.PlayerState.IDLE) return null
      const video = findVideo(document)
      if (!video) return null
      return { time: video.currentTime, paused: manager.getPlayerState() === messages.PlayerState.PAUSED, ended: false, stopped: false }
    },
    onError(listener) {
      errors.add(listener)
      return () => {
        errors.delete(listener)
      }
    },
    onSenderLoad(listener) {
      senderLoads.add(listener)
      return () => {
        senderLoads.delete(listener)
      }
    },
  }
}
