import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackEvent } from '../lib/analytics'

const STEP_SECONDS = 5
const MARKS = [
  { seconds: 60, action: '1 min' },
  { seconds: 600, action: '10 min' },
]

/**
 * Reports that a visitor stayed 1 and 10 minutes on what the page shows. Matomo measures the time between actions, so
 * someone who opens one stream and watches it for an hour would otherwise count as zero seconds. Time counts while the page is
 * visible, or while its video is popped out (watching in the little window is the point of it, whatever tab is in front).
 * Another page or another name starts again. `name` is null while there is nothing to report on.
 */
export function useStayed(name: string | null, floating: boolean): void {
  const { pathname } = useLocation()
  // Read by the timer, so popping the video out or bringing it back keeps the time already spent.
  const floatingRef = useRef(floating)
  useEffect(() => {
    floatingRef.current = floating
  })

  useEffect(() => {
    if (name === null) return
    let spent = 0
    let reached = 0
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' && !floatingRef.current) return
      spent += STEP_SECONDS
      if (spent < MARKS[reached].seconds) return
      trackEvent('Stayed', MARKS[reached].action, name)
      reached += 1
      if (reached === MARKS.length) clearInterval(timer)
    }, STEP_SECONDS * 1000)
    return () => clearInterval(timer)
  }, [name, pathname])
}
