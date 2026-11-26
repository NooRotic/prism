import { useEffect, useState } from 'react'
import { clockParts } from './tvText'

/** The time, small, top right: the set-top box's oldest habit. Shown only while PRISM has something on screen. */
export default function TvClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Again at the start of the next minute, and so on.
    const timer = setTimeout(() => setNow(new Date()), 60_000 - (now.getTime() % 60_000) + 50)
    return () => clearTimeout(timer)
  }, [now])
  const { time, period } = clockParts(now)
  // The separator between hours and minutes fades slowly on and off.
  const split = time.search(/\D/)
  return (
    <p data-testid="tv-clock" className="tv-clock">
      {split === -1 ? (
        time
      ) : (
        <>
          {time.slice(0, split)}
          <span className="tv-clock-colon">{time[split]}</span>
          {time.slice(split + 1)}
        </>
      )}
      {period && <span className="tv-clock-period">{period}</span>}
    </p>
  )
}
