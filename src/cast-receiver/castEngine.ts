import { contentType, parseLoadData, type CastLoadData, type CastStream } from '../lib/cast/messages'
import type { CastEngine, EngineSample } from '../lib/cast/tuner'

/** On the engine's own loads, so one that comes back through the load interceptor is not taken for a sender's. */
const OWN = 'tv'

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
  return {
    id: data?.id ?? null,
    name: media.metadata?.title || 'Stream',
    url,
    kind,
    live: data?.live ?? true,
    logo: media.metadata?.images?.[0]?.url ?? null,
  }
}

/** The only code that touches Cast's player. */
export function createCastEngine(manager: cast.framework.PlayerManager): CastEngine {
  const { events, messages } = cast.framework
  // Where the current load stands. Until Cast has begun it, an error or a moving picture still belongs to the last stream.
  let phase: 'none' | 'asked' | 'loading' | 'ready' = 'none'
  let finished: 'ended' | 'stopped' | null = null
  let live = true
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
    if (phase !== 'none') phase = 'ready'
  })
  manager.addEventListener(events.EventType.ERROR, () => {
    if (phase === 'loading' || phase === 'ready') for (const listener of [...errors]) listener()
  })
  manager.addEventListener(events.EventType.MEDIA_FINISHED, (event) => {
    if (phase !== 'ready') return
    if (event.endedReason === events.EndedReason.END_OF_STREAM) finished = 'ended'
    if (event.endedReason === events.EndedReason.STOPPED) finished = 'stopped'
  })

  manager.setMessageInterceptor<cast.framework.messages.LoadRequestData>(messages.MessageType.LOAD, (request) => {
    const raw = request.media?.customData
    if (typeof raw === 'object' && raw !== null && (raw as { origin?: unknown }).origin === OWN) return request
    const data = parseLoadData(raw)
    const stream = readRequest(request.media, data)
    if (!stream) return new messages.ErrorData(messages.ErrorType.LOAD_FAILED)
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
    load(stream) {
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
      media.customData = { v: 1, origin: OWN, id: stream.id, kind: stream.kind, live: stream.live, favorites: [], group: null }
      const request = new messages.LoadRequestData()
      request.autoplay = true
      request.media = media
      return Promise.resolve(manager.load(request))
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
