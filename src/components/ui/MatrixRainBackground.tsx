import { useEffect, useRef } from 'react'

// Characters used in the rain — katakana-inspired + digits + symbols
const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789PRISM'

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
    let columns: number[] = []
    let fontSize = 14

    function resize() {
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      fontSize = 14 * dpr

      // Initialize column drop positions
      const p = propsRef.current
      const gap = p.columnGap * dpr
      const numCols = Math.ceil(canvas.width / gap)
      columns = Array.from({ length: numCols }, () =>
        Math.random() * canvas.height / fontSize,
      )
    }

    resize()
    window.addEventListener('resize', resize)

    let lastTime = 0
    const interval = 50 // ms between frames (~20fps for rain feel)

    function frame(time: number) {
      rafId = requestAnimationFrame(frame)
      if (!ctx || !canvas) return

      const delta = time - lastTime
      if (delta < interval / propsRef.current.speed) return
      lastTime = time

      const p = propsRef.current
      const dpr = Math.min(window.devicePixelRatio, 2)
      const gap = p.columnGap * dpr

      // Fade existing content — creates the trail effect
      ctx.fillStyle = `rgba(0, 0, 0, 0.05)`
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw characters
      ctx.fillStyle = p.color
      ctx.font = `${fontSize}px monospace`
      ctx.globalAlpha = p.opacity

      for (let i = 0; i < columns.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)]
        const x = i * gap
        const y = columns[i] * fontSize

        // Brighter leading character
        ctx.globalAlpha = p.opacity * 2.5
        ctx.fillText(char, x, y)

        // Randomly reset column to top when it goes off screen
        if (y > canvas.height && Math.random() > 0.975) {
          columns[i] = 0
        }
        columns[i]++
      }

      ctx.globalAlpha = 1
    }

    rafId = requestAnimationFrame(frame)

    // Listen for motion preference changes
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
