import { useCallback, useEffect, useRef, useState } from 'react'
import { loadStreamSnapshot, refreshStreamSnapshot, type SnapshotResult, type StreamSnapshot } from '../lib/streamsApi'

const OLD_MS = 30 * 60_000

/** The channel list, from PRISM's own server: the TV never needs the computer for it. */
export function useChannelList(): { list: StreamSnapshot | null; refreshIfOld(): void } {
  const [list, setList] = useState<StreamSnapshot | null>(null)
  // When the list in hand came, or null when there is none worth having. `asking` keeps it to one request at a time.
  const cameAt = useRef<number | null>(null)
  const asking = useRef(false)

  const ask = useCallback((request: () => Promise<SnapshotResult>) => {
    if (asking.current) return
    asking.current = true
    void request().then((result) => {
      asking.current = false
      if (result.kind !== 'ready') return
      if (result.snapshot.streams.length > 0) cameAt.current = performance.now()
      setList(result.snapshot)
    })
  }, [])

  useEffect(() => ask(() => loadStreamSnapshot()), [ask])

  const refreshIfOld = useCallback(() => {
    if (cameAt.current === null || performance.now() - cameAt.current >= OLD_MS) ask(refreshStreamSnapshot)
  }, [ask])

  return { list, refreshIfOld }
}
