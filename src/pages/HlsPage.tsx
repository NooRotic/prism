import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { demoToEntry, getHlsDashDemo } from '../config/demoContent'
import { STORAGE_KEYS } from '../config/storageKeys'
import { useStreamSnapshot } from '../hooks/useStreamSnapshot'
import { buildStreamPath, CUSTOM_STREAM_ID } from '../lib/routes'
import { filterStreams, groupCounts } from '../lib/streamFilter'
import { resolveSnapshotStream, resolveStreamSource, type StreamSource } from '../lib/streamSource'
import type { StreamEntry } from '../lib/streamsApi'
import StreamPlayerPanel from '../components/player/StreamPlayerPanel'
import AboutPanel from '../components/streams/AboutPanel'
import GroupPills from '../components/streams/GroupPills'
import StreamCard from '../components/streams/StreamCard'
import StreamGrid from '../components/streams/StreamGrid'
import StreamSearch from '../components/streams/StreamSearch'

/** The demo the page opens on when the server's list has no default of its own (or there is no list). */
const DEFAULT_DEMO_ID = 'bbb-hls'
const DEMO_GROUPS = ['Demo']
const NO_PARAMS = new URLSearchParams()

/** The group the visitor chose last time, by name, or null. Never throws: a blocked or full storage just forgets. */
function readSavedGroup(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.LOCAL_HLS_GROUP) || null
  } catch {
    return null
  }
}

/** Remembers the visitor's choice (null, "all streams", forgets it). Only the visitor's own choice is ever written. */
function saveGroup(name: string | null): void {
  try {
    if (name === null) localStorage.removeItem(STORAGE_KEYS.LOCAL_HLS_GROUP)
    else localStorage.setItem(STORAGE_KEYS.LOCAL_HLS_GROUP, name)
  } catch {
    // Private window or storage turned off: the choice simply does not survive a reload.
  }
}

/** What the About panel shows for an address that is not in the list (a pasted one). */
function pastedEntry(source: StreamSource): StreamEntry {
  return {
    id: `pasted:${source.url}`,
    name: 'Pasted address',
    groups: [],
    country: null,
    logo: null,
    kind: source.kind === 'dash' ? 'dash' : 'hls',
    pinned: false,
    state: 'new',
    url: source.url,
  }
}

function PlayerPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border p-6 text-center"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {children}
    </div>
  )
}

function StreamNotFound({ streamId, hasUrl }: { streamId: string | undefined; hasUrl: boolean }) {
  let message: string
  if (streamId && streamId !== CUSTOM_STREAM_ID) message = `No stream called “${streamId}”.`
  else if (!hasUrl) message = 'No stream address was given.'
  else message = "That address isn't an HLS, DASH or MP4 stream."

  return (
    <PlayerPlaceholder>
      <p className="text-lg" style={{ color: 'var(--text-primary)' }}>
        {message}
      </p>
      <p className="text-sm">Pick a stream from the list below.</p>
    </PlayerPlaceholder>
  )
}

/**
 * The HLS / DASH page: a player, "About this stream" beside it, and below them a searchable list of streams from the
 * history server (windowed, so thousands of cards cost a few dozen elements). When the server cannot give a list the
 * page shows the built-in demo streams instead, so it is never blank.
 */
export default function HlsPage() {
  const { streamId } = useParams<{ streamId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const { status, snapshot } = useStreamSnapshot()
  const [text, setText] = useState('')
  // The chosen group is kept by NAME (its position changes with the list) and remembered across reloads. It starts as what
  // was saved; what the page shows follows from it and the list that is showing (see `group` below).
  const [groupName, setGroupName] = useState<string | null>(readSavedGroup)
  const playerAnchor = useRef<HTMLDivElement | null>(null)

  const demoEntries = useMemo(() => getHlsDashDemo().map(demoToEntry), [])
  // A list with no streams is as good as no list: the page shows the demos instead of an empty box.
  const real = status === 'ready' && snapshot !== null && snapshot.streams.length > 0 ? snapshot : null
  const showingDemos = status !== 'loading' && real === null
  const entries = real?.streams ?? demoEntries
  const groupNames = real?.groups ?? DEMO_GROUPS
  // The chosen group's position in the list that is showing. A saved group that list does not have (the demo list while the
  // server is down, a group that was dropped) shows every stream, and stays saved: it applies again when the list has it.
  const group = useMemo(() => {
    if (groupName === null) return null
    const index = groupNames.indexOf(groupName)
    return index === -1 ? null : index
  }, [groupName, groupNames])
  const selectGroup = useCallback(
    (index: number | null) => {
      const name = index === null ? null : (groupNames[index] ?? null)
      setGroupName(name)
      saveGroup(name)
    },
    [groupNames],
  )

  // What to play: a pasted address or a demo id first (they always worked), then a stream of the list, then the default.
  // An id that might be in a list that has not arrived yet waits, rather than being called unknown.
  const { source, waiting } = useMemo((): { source: StreamSource | null; waiting: boolean } => {
    if (streamId) {
      const direct = resolveStreamSource(streamId, searchParams)
      if (direct) return { source: direct, waiting: false }
      const listed = resolveSnapshotStream(streamId, real)
      if (listed) return { source: listed, waiting: false }
      return { source: null, waiting: status === 'loading' && streamId !== CUSTOM_STREAM_ID }
    }
    const listedDefault = real ? resolveSnapshotStream(real.defaultId ?? undefined, real) : null
    return { source: listedDefault ?? resolveStreamSource(DEFAULT_DEMO_ID, NO_PARAMS), waiting: false }
  }, [streamId, searchParams, real, status])

  // The rest of the app (debug panel, floating window) reads what is playing from app state.
  useEffect(() => {
    if (!source) return
    if (state.player.currentUrl !== source.url || state.player.detection?.type !== source.detection.type) {
      dispatch({ type: 'PLAY_URL', url: source.url, detection: source.detection })
    }
  }, [source]) // eslint-disable-line react-hooks/exhaustive-deps

  const playingEntry = useMemo(
    () => (source ? (entries.find((entry) => entry.url === source.url) ?? null) : null),
    [entries, source],
  )
  const aboutEntry = useMemo(() => playingEntry ?? (source ? pastedEntry(source) : null), [playingEntry, source])

  const afterSearch = useMemo(() => filterStreams(entries, { text, group: null }), [entries, text])
  const counts = useMemo(() => groupCounts(afterSearch, groupNames.length), [afterSearch, groupNames.length])
  const shown = useMemo(() => filterStreams(afterSearch, { text: '', group }), [afterSearch, group])

  const choose = useCallback(
    (id: string) => {
      if (id !== streamId) navigate(`/hls-dash/${id}`)
      playerAnchor.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    },
    [navigate, streamId],
  )
  const renderCard = useCallback(
    (stream: StreamEntry, selected: boolean) => <StreamCard stream={stream} selected={selected} onSelect={choose} />,
    [choose],
  )

  // Links made while the paste box sent streams to this page (`/hls-dash?url=...`) still work: the custom path plays them.
  const pastedUrl = streamId ? null : searchParams.get('url')
  if (pastedUrl) return <Navigate to={buildStreamPath(pastedUrl)} replace />

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pt-4 pb-10 md:px-6">
      <div ref={playerAnchor} className="flex scroll-mt-20 flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {source ? (
            <StreamPlayerPanel
              key={`${source.url}|${source.detection.type}`}
              source={source}
              heading={false}
              className="flex w-full flex-col gap-4"
            />
          ) : waiting ? (
            <PlayerPlaceholder>
              <p>Loading stream…</p>
            </PlayerPlaceholder>
          ) : (
            <StreamNotFound streamId={streamId} hasUrl={searchParams.has('url')} />
          )}
        </div>
        <AboutPanel stream={aboutEntry} groups={groupNames} />
      </div>

      <section aria-labelledby="hls-list-heading" className="mt-8 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'var(--accent-hls)' }} />
          <h2 id="hls-list-heading" className="font-heading text-xl tracking-wider uppercase" style={{ color: 'var(--accent-hls)' }}>
            HLS / DASH streams
          </h2>
          {status !== 'loading' && (
            <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              {afterSearch.length} {afterSearch.length === 1 ? 'stream' : 'streams'}
            </span>
          )}
        </div>

        {showingDemos && (
          <p role="status" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Showing the built-in demo streams
          </p>
        )}

        {status === 'loading' ? (
          <p className="py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
            Loading streams…
          </p>
        ) : (
          <>
            <StreamSearch value={text} onChange={setText} />
            <GroupPills groups={groupNames} counts={counts} total={afterSearch.length} selected={group} onSelect={selectGroup} />
            <StreamGrid streams={shown} selectedId={playingEntry?.id ?? null} onSelect={choose} renderCard={renderCard} />
          </>
        )}

        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          The stream list comes from the{' '}
          <a
            href="https://github.com/iptv-org/iptv"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--text-secondary)' }}
          >
            iptv-org
          </a>{' '}
          project (public domain). Streams that are not checked yet may not play.
        </p>
      </section>
    </div>
  )
}
