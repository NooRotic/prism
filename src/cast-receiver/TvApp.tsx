import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { PrismMark } from '../components/brand/PrismMark'
import { fromEntry, type CastStream, type ContextMessage, type NowMessage, type TvState } from '../lib/cast/messages'
import { BACK_AGAIN_MS, REMOTE_START, remote, resolveGuide, type RemoteContext, type RemoteEvent, type RemoteState } from '../lib/cast/remote'
import { guideGroups, surfList } from '../lib/cast/surf'
import { createTuner, type CastEngine, type EngineReport } from '../lib/cast/tuner'
import TvBanner from './TvBanner'
import TvClock from './TvClock'
import TvGuide from './TvGuide'
import TvShareCard from './TvShareCard'
import { debugLine } from './tvText'
import { useChannelList } from './useChannelList'
import { useQrStyle } from './useQrStyle'

const TICK_MS = 250
const BANNER_MS = 4_000
const NO_LIST_MS = 4_000

const SHOWS_STATE: ReadonlySet<TvState> = new Set<TvState>(['tuning', 'buffering', 'paused'])
/** The player is asked what it is doing every tick while a channel starts, and every fourth one after. */
const SLOW_POLL_TICKS = 4

const sameReport = (a: EngineReport, b: EngineReport) => (Object.keys({ ...a, ...b }) as (keyof EngineReport)[]).every((k) => a[k] === b[k])

export interface TvAppProps {
  engine: CastEngine
  sendNow(message: NowMessage): void
  leave(): void
  onContext(listener: (message: ContextMessage) => void): () => void
}

/** Whether a tick changed anything that shows, so the page is not drawn again four times a second for nothing. */
function sameToSee(a: RemoteState, b: RemoteState): boolean {
  return a.pending === b.pending && a.card === b.card && a.guide?.key === b.guide?.key && a.guide?.id === b.guide?.id && a.guide?.group === b.guide?.group && a.guide?.row === b.guide?.row
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
  /** When the current channel was tuned, and how long its picture took to start. */
  const [timing, setTiming] = useState<{ tuneAt: number; startedInMs: number | null }>({ tuneAt: 0, startedInMs: null })
  /** What the player said last, and when. */
  const [player, setPlayer] = useState<{ report: EngineReport; at: number }>(() => ({ report: engine.report(), at: performance.now() }))
  const qr = useQrStyle()

  const context = useMemo<RemoteContext>(
    () => ({
      surf: surfList(list, favorites, group),
      groups: guideGroups(list, favorites),
      playingId: view.stream?.id ?? null,
      retry: view.state === 'failed' || view.state === 'ended',
      onAir: view.stream !== null,
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
      // A new press takes a notice away; a key that is only being held does not.
      if (event.type === 'keydown' && result.claimed && !result.state.lastKey?.repeating) setNotice(null)
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

  // The player is asked only while a debug line is on screen: nothing is drawn again for words nobody can see.
  const debugShown = useRef(false)
  useEffect(() => {
    let slow = 0
    const id = setInterval(() => {
      const now = performance.now()
      tuner.tick(now)
      handle({ type: 'tick' }, now)
      if (!debugShown.current) return
      const starting = tuner.view().state === 'tuning' || tuner.view().state === 'buffering'
      slow = (slow + 1) % SLOW_POLL_TICKS
      if (starting || slow === 0) {
        const report = engine.report()
        setPlayer((before) => (sameReport(before.report, report) && !starting ? before : { report, at: now }))
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [tuner, handle, engine])

  // The card shows the style the owner chose in /admin: asked again each time it comes up.
  const cardAt = hand.card?.at ?? null
  const { ask } = qr
  useEffect(() => {
    if (cardAt !== null) ask()
  }, [cardAt, ask])

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
      const at = performance.now()
      if (last.stream !== before.stream) {
        setTiming({ tuneAt: at, startedInMs: null })
        // The new channel's own first words, never the last one's.
        setPlayer({ report: engine.report(), at })
      }
      else if (last.state === 'playing') setTiming((t) => (t.startedInMs === null ? { ...t, startedInMs: at - t.tuneAt } : t))
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
  }, [tuner, sendNow, engine])

  const { stream, state } = view
  const entryOf = (id: string | null) => (id === null ? null : (list?.streams.find((s) => s.id === id) ?? null))
  const groupOf = (id: string | null) => {
    const index = entryOf(id)?.groups[0]
    return index === undefined ? null : (list?.groups[index] ?? null)
  }

  const preview = hand.pending?.entry ?? null
  // Placed again in the groups of this moment: the list can have changed since the last key.
  const guide = hand.guide && resolveGuide(hand.guide, context.groups)
  const card = hand.card && stream
  const named = preview ?? (stream && (SHOWS_STATE.has(state) || (state === 'playing' && fresh === stream)) ? stream : null)
  const message =
    stream === null || preview !== null || guide !== null || card
      ? null
      : state === 'failed'
        ? `${stream.name} is not available right now. Press Up or Down for another channel.`
        : state === 'ended'
          ? `${stream.name} has finished. Press Up or Down for another channel.`
          : null

  const surfAt = stream === null ? -1 : context.surf.findIndex((s) => s.id === stream.id)
  const debug = stream
    ? debugLine({
        state,
        sinceTuneMs: player.at - timing.tuneAt,
        startedInMs: timing.startedInMs,
        report: player.report,
        kind: stream.kind,
        live: stream.live,
        place: surfAt === -1 ? null : { at: surfAt + 1, of: context.surf.length },
      }) || null
    : null

  const showsDebug = Boolean(debug) && (Boolean(guide && stream) || Boolean(named && !guide && !card && !preview) || Boolean(message))
  useLayoutEffect(() => {
    debugShown.current = showsDebug
  })

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
        <div className="tv-message">
          <p role="alert">{message}</p>
          {debug && <p className="tv-debug">{debug}</p>}
        </div>
      )}
      {(guide || (named && !card) || card) && <TvClock />}
      {guide && <TvGuide groups={context.groups} at={guide} playingId={context.playingId} />}
      {guide && stream && (
        <TvBanner name={stream.name} entry={entryOf(stream.id)} group={groupOf(stream.id)} state={state} live={stream.live} debug={debug} compact />
      )}
      {named && !guide && !card && (
        <TvBanner
          name={named.name}
          entry={entryOf(named.id)}
          group={groupOf(named.id)}
          state={preview ? null : state}
          live={preview || !stream ? true : stream.live}
          debug={preview ? null : debug}
        />
      )}
      {card && (
        <TvShareCard stream={card} entry={entryOf(card.id)} group={groupOf(card.id)} qrStyle={qr.style} notWorking={state === 'failed' || state === 'ended'} />
      )}
      {notice && (
        <p role="status" className="tv-notice">
          {notice}
        </p>
      )}
    </div>
  )
}
