import { useEffect, useMemo, useState } from 'react'
import { clockParts } from './tvText'

/** The time, small, top right: the set-top box's oldest habit. Shown only while PRISM has something on screen. */
export default function TvClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Again at the start of the next minute, and so on.
    const timer = setTimeout(() => setNow(new Date()), 60_000 - (now.getTime() % 60_000) + 50)
    return () => clearTimeout(timer)
  }, [now])
  const { time, period, hour, separator, minute } = useMemo(() => clockParts(now), [now])
  // The separator between hours and minutes fades slowly on and off.
  return (
    <p data-testid="tv-clock" className="tv-clock">
      {hour && minute && separator ? (
        <>
          {hour}
          <span className="tv-clock-colon">{separator}</span>
          {minute}
        </>
      ) : (
        time
      )}
      {period && <span className="tv-clock-period">{period}</span>}
    </p>
  )
}
