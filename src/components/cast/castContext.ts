import { createContext, useContext } from 'react'
import { NO_CAST, type CastSender, type CastView } from '../../lib/cast/castSender'

/** What the pages see of casting: how it stands, and what they can ask for. */
export type CastApi = CastView & Pick<CastSender, 'load' | 'start' | 'tune' | 'togglePause' | 'stop' | 'clearEnded'>

const nothing = () => {}

export const CastContext = createContext<CastApi>({
  ...NO_CAST,
  load: nothing,
  start: nothing,
  tune: nothing,
  togglePause: nothing,
  stop: nothing,
  clearEnded: nothing,
})

/** Casting, or (outside the layout, and in a page's tests) a working "no device anywhere". */
export function useCast(): CastApi {
  return useContext(CastContext)
}
