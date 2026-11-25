import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { createCastSender, type CastSender } from '../../lib/cast/castSender'
import { CastContext, type CastApi } from './castContext'

// One per page load: Google's SDK has one context, and casting outlives every component.
let shared: CastSender | null = null
function sharedSender(): CastSender {
  shared ??= createCastSender()
  return shared
}

/** Holds the cast for the whole app, so it survives moving between pages. */
export default function CastProvider({ children, sender = sharedSender() }: { children: ReactNode; sender?: CastSender }) {
  const view = useSyncExternalStore(sender.subscribe, sender.view, sender.view)
  const api = useMemo<CastApi>(() => ({ ...sender, ...view }), [sender, view])
  return <CastContext value={api}>{children}</CastContext>
}
