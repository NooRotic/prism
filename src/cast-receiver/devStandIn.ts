// The TV page without a TV, on the dev server only (`/cast/index.html?dev`): a pretend player whose clock simply runs. Channels
// whose name has a digit fail at once, so every screen can be seen. Never part of the built page.
import type { CastLoadData, CastStream } from '../lib/cast/messages'
import { fromEntry } from '../lib/cast/messages'
import type { CastEngine } from '../lib/cast/tuner'
import { loadStreamSnapshot } from '../lib/streamsApi'
import type { TvAppProps } from './TvApp'

export async function devProps(): Promise<TvAppProps> {
  const result = await loadStreamSnapshot()
  const streams = result.kind === 'ready' ? result.snapshot.streams : []
  let startedAt = 0
  let senderLoad: ((stream: CastStream, data: CastLoadData | null) => void) | null = null
  const begin = () => {
    startedAt = performance.now() + 2500
  }
  const engine: CastEngine = {
    load: (stream) => {
      begin()
      return /\d/.test(stream.name) ? Promise.reject(new Error('pretend failure')) : Promise.resolve()
    },
    stop: () => {},
    sample: () => (startedAt === 0 || performance.now() < startedAt ? null : { time: (performance.now() - startedAt) / 1000, paused: false, ended: false, stopped: false }),
    onError: () => () => {},
    onSenderLoad: (listener) => {
      senderLoad = listener
      return () => {}
    },
  }
  setTimeout(() => {
    if (!streams[0]) return
    begin()
    senderLoad?.(fromEntry(streams[0]), { v: 1, id: streams[0].id, kind: streams[0].kind, live: true, favorites: streams.slice(0, 12).map((s) => s.id), group: null })
  }, 3000)
  return { engine, sendNow: (message) => console.info('now', message), leave: () => console.info('leave'), onContext: () => () => {} }
}
