import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { PrismMark } from '../components/brand/PrismMark'
import { fromEntry, type CastStream, type ContextMessage, type NowMessage, type TvState } from '../lib/cast/messages'
import { BACK_AGAIN_MS, REMOTE_START, remote, resolveGuide, type RemoteContext, type RemoteEvent, type RemoteState } from '../lib/cast/remote'
import { guideGroups, surfList } from '../lib/cast/surf'
import { createTuner, type CastEngine } from '../lib/cast/tuner'
import TvBanner from './TvBanner'
import TvGuide from './TvGuide'
import { useChannelList } from './useChannelList'

const TICK_MS = 250
const BANNER_MS = 4_000
const NO_LIST_MS = 4_000

const NOTES: Partial<Record<TvState, string>> = { tuning: 'Tuning…', buffering: 'Buffering…', paused: 'Paused' }

export interface TvAppProps {
  engine: CastEngine
  sendNow(message: NowMessage): void
  leave(): void
  onContext(listener: (message: ContextMessage) => void): () => void
}

/** Whether a tick changed anything that shows, so the page is not drawn again four times a second for nothing. */
function sameToSee(a: RemoteState, b: RemoteState): boolean {
  return a.pending === b.pending && a.guide?.key === b.guide?.key && a.guide?.id === b.guide?.id && a.guide?.group === b.guide?.group && a.guide?.row === b.guide?.row
}

/** PRISM on the TV: the picture is Cast's player behind this; everything drawn over it, and the remote, is here. */
export default function TvApp({ engine, sendNow, leave, onContext }: TvAppProps) {
  const [tuner] = useState(() => createTuner(engine, () => performance.now()))
  const view = useSyncExternalStore(tuner.subscribe, tuner.view)
  const { list, refreshIfOld } = useChannelList()
  const [favorites, setFavorites] = useState<string[]>([])
  const [group, setGroup] = useState<string | null>(null)
  const [hand, setHand] = useState(REMOTE_START)
  const [notice, setNotice] = useState<string | null>(null)
  /** The stream whose picture has just started: its name stays a moment. */
  const [fresh, setFresh] = useState<CastStream | null>(null)

  const context = useMemo<RemoteContext>(
    () => ({
      surf: surfList(list, favorites, group),
      groups: guideGroups(list, favorites),
      playingId: view.stream?.id ?? null,
      retry: view.state === 'failed' || view.state === 'ended',
    }),
    [list, favorites, group, view],
  )

  // The remote is worked out when a key arrives, from what stands then; the state drawn follows it.
  const handNow = useRef<RemoteState>(REMOTE_START)
  const contextNow = useRef(context)
  useLayoutEffect(() => {
    contextNow.current = context
  }, [context])
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const say = useCallback((text: string, ms: number) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = setTimeout(() => setNotice(null), ms)
  }, [])

  const handle = useCallback(
    (event: RemoteEvent, at: number): boolean => {
      const before = handNow.current
      const result = remote(before, event, at, contextNow.current)
      handNow.current = result.state
      if (event.type !== 'tick' || !sameToSee(before, result.state)) setHand(result.state)
      if (event.type === 'keydown' && result.claimed && !result.effects.some((effect) => effect.type === 'backHint' || effect.type === 'noList')) setNotice(null)
      for (const effect of result.effects) {
        if (effect.type === 'tune') tuner.tune(fromEntry(effect.entry))
        else if (effect.type === 'refreshList') refreshIfOld()
        else if (effect.type === 'noList') say('The channel list is not available right now', NO_LIST_MS)
        else if (effect.type === 'backHint') say('Press Back again to leave', BACK_AGAIN_MS)
        else if (effect.type === 'leave') leave()
      }
      return result.claimed
    },
    [tuner, refreshIfOld, say, leave],
  )

  // Layout effects: a load or a key can arrive as soon as the page is there.
  useLayoutEffect(
    () =>
      engine.onSenderLoad((stream, data) => {
        if (data) {
          setFavorites(data.favorites)
          setGroup(data.group)
        }
        tuner.adopt(stream)
        handle({ type: 'taken' }, performance.now())
      }),
    [engine, tuner, handle],
  )

  useLayoutEffect(() => onContext((message) => setFavorites(message.favorites)), [onContext])

  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const type = event.type === 'keyup' ? 'keyup' : 'keydown'
      if (!handle({ type, key: event.key }, event.timeStamp)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
    }
  }, [handle])

  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now()
      tuner.tick(now)
      handle({ type: 'tick' }, now)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [tuner, handle])

  // What PRISM is told, and the moment a picture starts.
  useLayoutEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let last = tuner.view()
    const tell = () => sendNow({ v: 1, type: 'now', id: last.stream?.id ?? null, name: last.stream?.name ?? '', state: last.state })
    tell()
    const off = tuner.subscribe(() => {
      const before = last
      last = tuner.view()
      tell()
      if (last.state === 'playing' && (before.state === 'tuning' || before.state === 'failed')) {
        if (timer) clearTimeout(timer)
        setFresh(last.stream)
        timer = setTimeout(() => setFresh(null), BANNER_MS)
      }
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [tuner, sendNow])

  const { stream, state } = view
  const entryOf = (id: string | null) => (id === null ? null : (list?.streams.find((s) => s.id === id) ?? null))
  const groupOf = (id: string | null) => {
    const index = entryOf(id)?.groups[0]
    return index === undefined ? null : (list?.groups[index] ?? null)
  }

  const preview = hand.pending?.entry ?? null
  // Placed again in the groups of this moment: the list can have changed since the last key.
  const guide = hand.guide && resolveGuide(hand.guide, context.groups)
  const note = NOTES[state] ?? null
  const named = preview ?? (stream && (note !== null || (state === 'playing' && fresh === stream)) ? stream : null)
  const message =
    stream === null || preview !== null || guide !== null
      ? null
      : state === 'failed'
        ? `${stream.name} is not available right now. Press Up or Down for another channel.`
        : state === 'ended'
          ? `${stream.name} has finished. Press Up or Down for another channel.`
          : null

  return (
    <div className="tv">
      {stream === null && (
        <div className="tv-start">
          <PrismMark variant="icon" className="tv-start-mark" />
          <p className="tv-start-name">PRISM</p>
          <p className="tv-small">Pick a stream in PRISM</p>
        </div>
      )}
      {message && (
        <p role="alert" className="tv-message">
          {message}
        </p>
      )}
      {guide && <TvGuide groups={context.groups} at={guide} playingId={context.playingId} />}
      {named && !guide && <TvBanner name={named.name} entry={entryOf(named.id)} group={groupOf(named.id)} note={preview ? null : note} />}
      {notice && (
        <p role="status" className="tv-notice">
          {notice}
        </p>
      )}
    </div>
  )
}
