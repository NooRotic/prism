import { useEffect, useRef } from 'react'

// Characters used in the rain — katakana-inspired + digits + symbols
const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789PRISM'

// Number of characters in each column's visible trail
const TRAIL_LENGTH = 12

interface MatrixRainProps {
  /** Overall opacity (0-1). Default 0.07 */
  opacity?: number
  /** Column density — gap between columns in px. Default 20 */
  columnGap?: number
  /** Fall speed multiplier. Default 1 */
  speed?: number
  /** Rain color. Default #39FF14 (PRISM accent green) */
  color?: string
}

interface ColumnState {
  /** Current head position (in character rows) */
  pos: number
  /** Fixed characters for the trail so they don't flicker */
  chars: string[]
}

export default function MatrixRainBackground({
  opacity = 0.07,
  columnGap = 20,
  speed = 1,
  color = '#39FF14',
}: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef({ opacity, columnGap, speed, color })

  useEffect(() => {
    propsRef.current = { opacity, columnGap, speed, color }
  }, [opacity, columnGap, speed, color])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motionQuery.matches) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    let columns: ColumnState[] = []
    let fontSize = 14

    function randomChar(): string {
      return CHARS[Math.floor(Math.random() * CHARS.length)]
    }

    function initTrail(): string[] {
      return Array.from({ length: TRAIL_LENGTH }, () => randomChar())
    }

    function resize() {
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      fontSize = 14 * dpr

      const p = propsRef.current
      const gap = p.columnGap * dpr
      const numCols = Math.ceil(canvas.width / gap)
      const maxRows = Math.ceil(canvas.height / fontSize)

      columns = Array.from({ length: numCols }, () => ({
        pos: Math.floor(Math.random() * maxRows),
        chars: initTrail(),
      }))
    }

    resize()
    window.addEventListener('resize', resize)

    let lastTime = 0
    const interval = 50 // ~20fps

    function frame(time: number) {
      rafId = requestAnimationFrame(frame)
      if (!ctx || !canvas) return

      const delta = time - lastTime
      if (delta < interval / propsRef.current.speed) return
      lastTime = time

      const p = propsRef.current
      const dpr = Math.min(window.devicePixelRatio, 2)
      const gap = p.columnGap * dpr
      const maxRows = Math.ceil(canvas.height / fontSize)

      // Clear fully — no accumulation
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        const x = i * gap

        // Draw trail: each character fades based on distance from head
        for (let t = 0; t < TRAIL_LENGTH; t++) {
          const row = col.pos - t
          if (row < 0 || row >= maxRows) continue

          const y = (row + 1) * fontSize

          // Head character is brightest, tail fades out
          const fade = 1 - t / TRAIL_LENGTH
          ctx.globalAlpha = p.opacity * fade * (t === 0 ? 2.5 : 1)
          ctx.fillStyle = p.color
          ctx.fillText(col.chars[t % col.chars.length], x, y)
        }

        // Advance column
        col.pos++

        // Push a new random char into the trail head
        col.chars.pop()
        col.chars.unshift(randomChar())

        // Reset when the entire trail has scrolled off screen
        if (col.pos - TRAIL_LENGTH > maxRows && Math.random() > 0.95) {
          col.pos = 0
          col.chars = initTrail()
        }
      }

      ctx.globalAlpha = 1
    }

    rafId = requestAnimationFrame(frame)

    function onMotionChange(e: MediaQueryListEvent) {
      if (e.matches) {
        cancelAnimationFrame(rafId)
        if (ctx && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
      } else {
        rafId = requestAnimationFrame(frame)
      }
    }
    motionQuery.addEventListener('change', onMotionChange)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      motionQuery.removeEventListener('change', onMotionChange)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  )
}
