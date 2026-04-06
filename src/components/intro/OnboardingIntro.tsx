import { useRef, useEffect, useCallback, useState } from 'react'
import { createTimeline, stagger } from 'animejs'
import { animate } from 'animejs'

interface OnboardingIntroProps {
  onComplete: () => void
  onSkip: () => void
  onConnectTwitch: () => void
}

function el(
  tag: string,
  styles: Partial<CSSStyleDeclaration>,
  textContent?: string,
): HTMLElement {
  const node = document.createElement(tag)
  Object.assign(node.style, styles)
  if (textContent !== undefined) node.textContent = textContent
  return node
}

export function OnboardingIntro({ onComplete, onSkip, onConnectTwitch }: OnboardingIntroProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const completedRef = useRef(false)
  const [isFadingOut, setIsFadingOut] = useState(false)

  const handleDone = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    setIsFadingOut(true)

    if (overlayRef.current) {
      animate(overlayRef.current, {
        opacity: [1, 0],
        duration: 400,
        ease: 'inQuad',
        onComplete: () => onComplete(),
      })
    } else {
      onComplete()
    }
  }, [onComplete])

  const handleSkip = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    setIsFadingOut(true)

    if (overlayRef.current) {
      animate(overlayRef.current, {
        opacity: [1, 0],
        duration: 250,
        ease: 'inQuad',
        onComplete: () => onSkip(),
      })
    } else {
      onSkip()
    }
  }, [onSkip])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const created: HTMLElement[] = []
    const add = (node: HTMLElement) => {
      container.appendChild(node)
      created.push(node)
      return node
    }

    // -- Build DOM elements --

    // Ambient glow
    add(el('div', {
      position: 'absolute', inset: '0', pointerEvents: 'none',
      background: 'radial-gradient(ellipse 50% 40% at 50% 40%, rgba(57, 255, 20, 0.08), transparent 70%)',
    }))

    // "GLAZE ME" heading — letter spans for glitch-type effect
    const headingContainer = add(el('div', {
      position: 'absolute', top: '28%', left: '50%',
      transform: 'translateX(-50%)', whiteSpace: 'nowrap',
      fontFamily: 'var(--font-heading)', fontWeight: '900',
      fontSize: 'clamp(3rem, 8vw, 5.5rem)', letterSpacing: '0.1em',
      color: 'var(--accent-green)',
    }))

    const letters: HTMLSpanElement[] = []
    for (const char of 'GLAZE ME') {
      const span = document.createElement('span')
      span.textContent = char === ' ' ? '\u00A0' : char
      Object.assign(span.style, {
        display: 'inline-block', opacity: '0',
      })
      headingContainer.appendChild(span)
      letters.push(span)
    }

    // Tagline
    const tagline = add(el('div', {
      position: 'absolute', top: '44%', left: '50%',
      transform: 'translateX(-50%)', whiteSpace: 'nowrap',
      fontFamily: 'var(--font-body)', fontWeight: '300',
      fontSize: 'clamp(1rem, 2.5vw, 1.35rem)',
      color: 'var(--text-secondary)', opacity: '0',
      letterSpacing: '0.02em',
    }, 'The boldest way to explore any Twitch channel'))

    // Feature pills
    const features = ['Clips', 'VODs', 'Stats', 'Emotes', 'Badges']
    const pillContainer = add(el('div', {
      position: 'absolute', top: '52%', left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', gap: '10px', opacity: '0',
    }))

    const pills: HTMLElement[] = []
    features.forEach((feature) => {
      const pill = el('span', {
        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
        fontWeight: '500', letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--accent-twitch)', opacity: '0',
        padding: '4px 12px', borderRadius: '999px',
        border: '1px solid rgba(145, 70, 255, 0.3)',
        background: 'rgba(145, 70, 255, 0.06)',
      }, feature)
      pillContainer.appendChild(pill)
      pills.push(pill)
    })

    // Description line
    const desc = add(el('div', {
      position: 'absolute', top: '60%', left: '50%',
      transform: 'translateX(-50%)', textAlign: 'center',
      maxWidth: '500px', lineHeight: '1.6',
      fontFamily: 'var(--font-body)', fontWeight: '300',
      fontSize: '0.95rem', color: 'var(--text-muted)', opacity: '0',
    }, 'Paste any Twitch, YouTube, or HLS stream URL to watch instantly. Connect your Twitch account to unlock full channel exploration with stats, clips, and emotes.'))

    // Connect Twitch button
    const connectBtn = add(el('button', {
      position: 'absolute', top: '72%', left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
      fontWeight: '500', letterSpacing: '0.08em', textTransform: 'uppercase',
      color: '#fff', padding: '12px 32px', borderRadius: '8px',
      border: 'none', cursor: 'pointer', opacity: '0',
      background: 'linear-gradient(135deg, var(--accent-twitch), #7b2ff2)',
      boxShadow: '0 0 30px rgba(145, 70, 255, 0.3)',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }, 'Connect Twitch'))

    connectBtn.addEventListener('mouseenter', () => {
      connectBtn.style.transform = 'translateX(-50%) scale(1.05)'
      connectBtn.style.boxShadow = '0 0 40px rgba(145, 70, 255, 0.5)'
    })
    connectBtn.addEventListener('mouseleave', () => {
      connectBtn.style.transform = 'translateX(-50%) scale(1)'
      connectBtn.style.boxShadow = '0 0 30px rgba(145, 70, 255, 0.3)'
    })
    connectBtn.addEventListener('click', () => {
      onConnectTwitch()
    })

    // "or paste any URL" hint
    const hint = add(el('div', {
      position: 'absolute', top: '80%', left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
      color: 'var(--text-muted)', opacity: '0',
      letterSpacing: '0.05em',
    }, 'or paste any video URL above'))

    // -- Build timeline --

    const tl = createTimeline({ autoplay: false })

    // Letters glitch-type in
    tl.add(letters, {
      opacity: [0, 1],
      translateY: [() => Math.random() * 40 - 20, 0],
      duration: 60,
      delay: stagger(50),
      ease: 'outQuad',
    })

    // Heading glow pulse
    tl.add(headingContainer, {
      textShadow: [
        '0 0 20px rgba(57,255,20,0)',
        '0 0 30px rgba(57,255,20,0.3)',
      ],
      duration: 800,
      ease: 'outQuad',
    }, 400)

    // Tagline fade up
    tl.add(tagline, {
      opacity: [0, 1],
      translateY: [15, 0],
      duration: 600,
      ease: 'outExpo',
    }, 700)

    // Pill container appears
    tl.add(pillContainer, {
      opacity: [0, 1],
      duration: 200,
    }, 1100)

    // Individual pills stagger in
    tl.add(pills, {
      opacity: [0, 1],
      scale: [0.8, 1],
      duration: 400,
      delay: stagger(80),
      ease: 'outBack',
    }, 1150)

    // Description fade in
    tl.add(desc, {
      opacity: [0, 0.8],
      translateY: [10, 0],
      duration: 600,
      ease: 'outExpo',
    }, 1800)

    // Connect button slides up with glow
    tl.add(connectBtn, {
      opacity: [0, 1],
      translateY: [20, 0],
      scale: [0.9, 1],
      duration: 700,
      ease: 'outBack',
    }, 2200)

    // Hint fades in
    tl.add(hint, {
      opacity: [0, 0.5],
      duration: 500,
    }, 2700)

    tl.play()

    // Auto-complete after animation + linger time
    const duration = 6000
    const timer = setTimeout(() => {
      if (!completedRef.current) {
        handleDone()
      }
    }, duration)

    return () => {
      clearTimeout(timer)
      created.forEach((n) => n.remove())
    }
  }, [handleDone, onConnectTwitch])

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'var(--bg)', overflow: 'hidden',
        opacity: isFadingOut ? undefined : 1,
      }}
    >
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
      />

      <button
        onClick={handleSkip}
        style={{
          position: 'absolute', bottom: '2rem', right: '2rem', zIndex: 60,
          fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.35)',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '4px', padding: '0.4rem 0.8rem',
          cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase',
          transition: 'color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.35)'
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
        }}
      >
        Skip
      </button>
    </div>
  )
}
