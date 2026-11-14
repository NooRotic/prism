import { useEffect, useState } from 'react'
import { HISTORY_ENABLED } from '../config/historyServer'
import { loadStreamSnapshot, peekStreamSnapshot, type StreamSnapshot } from '../lib/streamsApi'

export interface StreamSnapshotState {
  status: 'loading' | 'ready' | 'unavailable'
  snapshot: StreamSnapshot | null
}

function initialState(): StreamSnapshotState {
  if (!HISTORY_ENABLED) return { status: 'unavailable', snapshot: null }
  const remembered = peekStreamSnapshot()
  return remembered?.kind === 'ready'
    ? { status: 'ready', snapshot: remembered.snapshot }
    : { status: 'loading', snapshot: null }
}

/**
 * The visitor stream list from the history server. It is fetched once per page session (a page that mounts later
 * gets the remembered list on its first frame) and `unavailable` covers every way it can fail: the page then shows
 * its built-in demo list. A request nobody is waiting for any more is abandoned when the page goes away.
 */
export function useStreamSnapshot(): StreamSnapshotState {
  const [state, setState] = useState<StreamSnapshotState>(initialState)

  useEffect(() => {
    if (state.status !== 'loading') return
    const controller = new AbortController()
    let cancelled = false
    void loadStreamSnapshot(controller.signal).then((result) => {
      if (cancelled) return
      setState(result.kind === 'ready' ? { status: 'ready', snapshot: result.snapshot } : { status: 'unavailable', snapshot: null })
    })
    return () => {
      cancelled = true
      controller.abort()
    }
    // Only the first state matters: once the list is loaded or has failed there is nothing more to ask for.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
