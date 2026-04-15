import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

/**
 * Pins a record of callback functions (or any other mutable inputs)
 * in a ref so they can be read by long-lived event handlers without
 * participating in a useEffect dependency array.
 *
 * **Why this exists**: several components in the player subtree
 * (VideoJSPlayer, DashJSPlayer) and several data hooks
 * (useYourStats, useCategoryStreams) need to call caller-supplied
 * callbacks from inside a one-time init effect. Putting the
 * callbacks directly in the effect's dep array makes the effect
 * re-run on every parent render that produces fresh callback
 * references — which for video.js and dashjs means a full media
 * pipeline teardown and rebuild, causing 2-5s of rebuffering per
 * spurious re-render. The fix we've been using is to store each
 * callback in its own useRef, update the refs in a side-effect,
 * and depend only on data identity in the init effect.
 *
 * This hook is the centralized version of that pattern. Pass an
 * object of callbacks and get back a stable ref object whose
 * `.current` always reflects the latest values. The returned ref
 * itself has stable identity (same object on every render), so
 * including it in a dep array is a no-op — but you typically don't
 * need to include it at all because the ref contents update
 * out-of-band via the internal effect.
 *
 * @example
 * ```tsx
 * function VideoPlayer({ onReady, onError }: Props) {
 *   const cb = useCallbackRefs({ onReady, onError })
 *   useEffect(() => {
 *     const player = createPlayer()
 *     player.on('ready', () => cb.current.onReady?.())
 *     player.on('error', (e) => cb.current.onError?.(e.message))
 *     return () => player.destroy()
 *   }, []) // no callback deps — refs handle that
 * }
 * ```
 *
 * This is the shape of the `useEvent` RFC the React team has
 * discussed — useCallbackRefs is a bulk version that keeps multiple
 * related callbacks in one ref object.
 */
export function useCallbackRefs<T extends Record<string, unknown>>(
  values: T,
): MutableRefObject<T> {
  const ref = useRef(values)
  useEffect(() => {
    ref.current = values
  })
  return ref
}
