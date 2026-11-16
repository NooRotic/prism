import { useSyncExternalStore } from 'react'
import { LANDSCAPE_PHONE_QUERY } from './landscapePhone'

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(LANDSCAPE_PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(LANDSCAPE_PHONE_QUERY).matches
}

/** True while the phone is held sideways (see LANDSCAPE_PHONE_QUERY); follows rotation and resizing. */
export function useLandscapePhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
