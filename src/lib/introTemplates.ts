import { createTimeline, stagger } from 'animejs'
import type { TwitchUser, TwitchChannel, TwitchStream, TwitchGame } from '../types/twitch'

export interface ClipThumbnail {
  url: string
  title: string
  views: number
}

export interface IntroContext {
  profile: TwitchUser
  channelInfo: TwitchChannel
  stream: TwitchStream | null
  isLive: boolean
  topClipCount: number
  emoteCount: number
  badgeCount: number
  topGame: TwitchGame | null
  clipThumbnails: ClipThumbnail[]
}

export interface IntroResult {
  timeline: ReturnType<typeof createTimeline>
  cleanup: () => void
}

export type IntroTemplateFn = (container: HTMLElement, context: IntroContext) => IntroResult

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function createLetterSpans(
  parent: HTMLElement,
  text: string,
  className: string,
  baseStyles: Partial<CSSStyleDeclaration>,
): HTMLSpanElement[] {
  const spans: HTMLSpanElement[] = []
  for (const char of text) {
    const span = document.createElement('span')
    span.textContent = char === ' ' ? '\u00A0' : char
    span.className = className
    Object.assign(span.style, {
      display: 'inline-block',
      ...baseStyles,
    })
    parent.appendChild(span)
    spans.push(span)
  }
  return spans
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ---------------------------------------------------------------------------
// Template: Glitch
// ---------------------------------------------------------------------------

const glitchTemplate: IntroTemplateFn = (container, ctx) => {
  const created: HTMLElement[] = []

  const add = (node: HTMLElement) => {
    container.appendChild(node)
    created.push(node)
    return node
  }

  // Name container — centered
  const nameRow = add(
    el('div', {
      position: 'absolute',
      top: '38%',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: 'var(--font-heading)',
      fontSize: '4rem',
      color: '#fff',
      whiteSpace: 'nowrap',
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
    }),
  )

  const letters = createLetterSpans(nameRow, ctx.profile.display_name, 'glitch-letter', {
    opacity: '0',
    position: 'relative',
  })

  // RGB split layers (red / cyan offsets)
  const rgbOverlay = add(
    el('div', {
      position: 'absolute',
      top: '38%',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: 'var(--font-heading)',
      fontSize: '4rem',
      whiteSpace: 'nowrap',
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      color: 'rgba(255, 0, 50, 0.6)',
      pointerEvents: 'none',
      opacity: '0',
    }),
  )
  rgbOverlay.textContent = ctx.profile.display_name

  const rgbOverlay2 = add(
    el('div', {
      position: 'absolute',
      top: '38%',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: 'var(--font-heading)',
      fontSize: '4rem',
      whiteSpace: 'nowrap',
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      color: 'rgba(0, 255, 255, 0.6)',
      pointerEvents: 'none',
      opacity: '0',
    }),
  )
  rgbOverlay2.textContent = ctx.profile.display_name

  // Stats row
  const stats = [
    ctx.isLive ? `${formatNumber(ctx.stream?.viewer_count ?? 0)} viewers` : 'OFFLINE',
    `${ctx.emoteCount} emotes`,
    `${ctx.topClipCount} clips`,
  ]

  const statEls = stats.map((text, i) => {
    const side = i === 0 ? 'left' : i === 1 ? 'right' : 'left'
    return add(
      el('div', {
        position: 'absolute',
        top: `${58 + i * 6}%`,
        [side]: side === 'left' ? '-100%' : '-100%',
        fontFamily: 'var(--font-mono)',
        fontSize: '1.1rem',
        color: 'var(--accent-green)',
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        textAlign: 'center',
        width: '100%',
      }, text),
    )
  })

  // Emote scatter
  const emoteEls: HTMLElement[] = []
  for (let i = 0; i < Math.min(8, ctx.emoteCount); i++) {
    const emote = add(
      el('div', {
        position: 'absolute',
        top: `${Math.random() * 80 + 10}%`,
        left: `${Math.random() * 80 + 10}%`,
        fontSize: '2rem',
        opacity: '0',
        pointerEvents: 'none',
      }, '\u2726'),
    )
    emote.style.color = 'var(--accent-twitch)'
    emoteEls.push(emote)
  }

  const tl = createTimeline({ autoplay: false })

  // Letters type in with glitch
  tl.add(letters, {
    opacity: [0, 1],
    translateY: [() => Math.random() * 60 - 30, 0],
    translateX: [() => Math.random() * 20 - 10, 0],
    duration: 80,
    delay: stagger(60),
    ease: 'outQuad',
  })

  // RGB split flash
  tl.add(rgbOverlay, {
    opacity: [0.8, 0],
    translateX: ['-50%', '-50%'],
    left: ['49%', '50%'],
    duration: 400,
    ease: 'outExpo',
  }, `-=${letters.length * 30}`)

  tl.add(rgbOverlay2, {
    opacity: [0.8, 0],
    translateX: ['-50%', '-50%'],
    left: ['51%', '50%'],
    duration: 400,
    ease: 'outExpo',
  }, `-=400`)

  // Stats slam in from edges
  statEls.forEach((statEl, i) => {
    const fromLeft = i % 2 === 0
    if (fromLeft) {
      tl.add(statEl, { left: ['-100%', '0%'], duration: 500, ease: 'outExpo' }, `-=${i === 0 ? 0 : 300}`)
    } else {
      tl.add(statEl, { right: ['-100%', '0%'], duration: 500, ease: 'outExpo' }, `-=${i === 0 ? 0 : 300}`)
    }
  })

  // Emotes scatter in
  tl.add(emoteEls, {
    opacity: [0, 0.7, 0],
    scale: [0, 1.5],
    duration: 800,
    delay: stagger(80),
    ease: 'outExpo',
  }, '-=400')

  tl.play()

  return {
    timeline: tl,
    cleanup: () => created.forEach((n) => n.remove()),
  }
}

// ---------------------------------------------------------------------------
// Template: Cinematic
// ---------------------------------------------------------------------------

const cinematicTemplate: IntroTemplateFn = (container, ctx) => {
  const created: HTMLElement[] = []
  const add = (node: HTMLElement) => {
    container.appendChild(node)
    created.push(node)
    return node
  }

  // Letterbox bars
  const topBar = add(el('div', {
    position: 'absolute', top: '0', left: '0', width: '100%', height: '12%',
    background: '#000', zIndex: '10',
  }))
  const bottomBar = add(el('div', {
    position: 'absolute', bottom: '0', left: '0', width: '100%', height: '12%',
    background: '#000', zIndex: '10',
  }))

  // Avatar
  const avatarWrap = add(el('div', {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '120px', height: '120px',
    borderRadius: '50%', overflow: 'hidden',
    border: '2px solid var(--accent-twitch)',
    opacity: '0',
  }))

  const avatarImg = document.createElement('img')
  avatarImg.src = ctx.profile.profile_image_url
  avatarImg.alt = ctx.profile.display_name
  Object.assign(avatarImg.style, { width: '100%', height: '100%', objectFit: 'cover' })
  avatarWrap.appendChild(avatarImg)

  // Name below avatar
  const nameEl = add(el('div', {
    position: 'absolute', top: '62%', left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'var(--font-heading)', fontSize: '2.5rem',
    color: '#fff', opacity: '0', whiteSpace: 'nowrap',
    letterSpacing: '0.1em', textTransform: 'uppercase',
  }, ctx.profile.display_name))

  // Stats counter
  const statsContainer = add(el('div', {
    position: 'absolute', top: '72%', left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex', gap: '2rem',
    fontFamily: 'var(--font-mono)', fontSize: '0.9rem',
    color: 'var(--accent-green)', opacity: '0',
    whiteSpace: 'nowrap',
  }))

  const counterData = [
    { label: 'CLIPS', value: ctx.topClipCount },
    { label: 'EMOTES', value: ctx.emoteCount },
    { label: 'BADGES', value: ctx.badgeCount },
  ]

  const counterEls: HTMLSpanElement[] = []
  counterData.forEach((d) => {
    const span = document.createElement('span')
    span.textContent = `${d.label}: 0`
    span.dataset.target = String(d.value)
    span.dataset.label = d.label
    statsContainer.appendChild(span)
    counterEls.push(span)
  })

  // Game box art
  let gameEl: HTMLElement | null = null
  if (ctx.topGame) {
    const artUrl = ctx.topGame.box_art_url
      .replace('{width}', '80')
      .replace('{height}', '108')
    gameEl = add(el('div', {
      position: 'absolute', top: '50%', right: '12%',
      transform: 'translateY(-50%)',
      opacity: '0',
    }))
    const img = document.createElement('img')
    img.src = artUrl
    img.alt = ctx.topGame.name
    Object.assign(img.style, {
      width: '80px', borderRadius: '4px',
      boxShadow: '0 0 20px rgba(145,70,255,0.3)',
    })
    gameEl.appendChild(img)

    const label = document.createElement('div')
    label.textContent = ctx.topGame.name
    Object.assign(label.style, {
      fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
      color: 'var(--accent-twitch)', textAlign: 'center',
      marginTop: '6px', maxWidth: '80px', overflow: 'hidden',
      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    })
    gameEl.appendChild(label)
  }

  const tl = createTimeline({
    autoplay: false,
    defaults: { ease: 'outExpo' },
  })

  // Letterbox slide in
  tl.add(topBar, { translateY: ['-100%', '0%'], duration: 600 })
  tl.add(bottomBar, { translateY: ['100%', '0%'], duration: 600 }, 0)

  // Avatar circle-reveal
  tl.add(avatarWrap, {
    opacity: [0, 1],
    scale: [0.3, 1],
    duration: 800,
    ease: 'outBack',
  }, 400)

  // Name fade up
  tl.add(nameEl, {
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 600,
  }, 800)

  // Stats counter roll
  tl.add(statsContainer, {
    opacity: [0, 1],
    duration: 300,
  }, 1200)

  // Counter animation (using anime value targets)
  counterEls.forEach((spanEl) => {
    const target = parseInt(spanEl.dataset.target ?? '0', 10)
    const label = spanEl.dataset.label ?? ''
    const obj = { val: 0 }
    tl.add(obj, {
      val: [0, target],
      duration: 1200,
      ease: 'outExpo',
      onUpdate: () => {
        spanEl.textContent = `${label}: ${Math.round(obj.val)}`
      },
    }, 1300)
  })

  // Game box art crossfade
  if (gameEl) {
    tl.add(gameEl, {
      opacity: [0, 1],
      translateX: [30, 0],
      duration: 800,
    }, 1600)
  }

  // Clip thumbnail highlight reel (crossfade through top clips)
  if (ctx.clipThumbnails.length > 0) {
    const clipReel = add(el('div', {
      position: 'absolute', bottom: '16%', left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', gap: '12px', opacity: '0',
    }))

    ctx.clipThumbnails.slice(0, 4).forEach((clip) => {
      const thumb = document.createElement('div')
      Object.assign(thumb.style, {
        width: '140px', height: '80px', borderRadius: '6px',
        overflow: 'hidden', position: 'relative', opacity: '0',
        border: '1px solid rgba(145,70,255,0.3)',
        boxShadow: '0 0 15px rgba(0,0,0,0.5)',
      })
      const img = document.createElement('img')
      img.src = clip.url
      img.alt = clip.title
      Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' })
      thumb.appendChild(img)

      const viewBadge = document.createElement('div')
      viewBadge.textContent = `${(clip.views / 1000).toFixed(1)}K`
      Object.assign(viewBadge.style, {
        position: 'absolute', bottom: '4px', right: '4px',
        background: 'rgba(0,0,0,0.7)', color: 'var(--accent-green)',
        fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
        padding: '1px 4px', borderRadius: '3px',
      })
      thumb.appendChild(viewBadge)

      clipReel.appendChild(thumb)
    })

    tl.add(clipReel, {
      opacity: [0, 1],
      duration: 400,
    }, 2200)

    tl.add(clipReel.children, {
      opacity: [0, 1],
      translateY: [15, 0],
      delay: stagger(120),
      duration: 500,
      ease: 'outBack',
    }, 2300)
  }

  tl.play()

  return {
    timeline: tl,
    cleanup: () => created.forEach((n) => n.remove()),
  }
}

// ---------------------------------------------------------------------------
// Template: Data Storm
// ---------------------------------------------------------------------------

const dataStormTemplate: IntroTemplateFn = (container, ctx) => {
  const created: HTMLElement[] = []
  const add = (node: HTMLElement) => {
    container.appendChild(node)
    created.push(node)
    return node
  }

  // Matrix rain columns
  const columns: HTMLElement[] = []
  const statValues = [
    String(ctx.topClipCount),
    String(ctx.emoteCount),
    String(ctx.badgeCount),
    formatNumber(ctx.profile.view_count),
    ctx.isLive ? String(ctx.stream?.viewer_count ?? 0) : '0',
  ]

  for (let i = 0; i < 20; i++) {
    const col = add(el('div', {
      position: 'absolute',
      top: '-20%',
      left: `${(i / 20) * 100}%`,
      fontFamily: 'var(--font-mono)',
      fontSize: '0.8rem',
      color: 'var(--accent-green)',
      opacity: '0.6',
      whiteSpace: 'nowrap',
      writingMode: 'vertical-lr',
      letterSpacing: '0.5em',
    }))
    // Fill with random digits and stat values
    let text = ''
    for (let j = 0; j < 20; j++) {
      text += j % 5 === 0
        ? statValues[Math.floor(Math.random() * statValues.length)]
        : String(Math.floor(Math.random() * 10))
    }
    col.textContent = text
    columns.push(col)
  }

  // Profile card (forms from particles)
  const card = add(el('div', {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '1.5rem 2rem',
    background: 'rgba(5, 5, 7, 0.9)',
    border: '1px solid var(--accent-green)',
    borderRadius: '8px',
    opacity: '0',
    boxShadow: '0 0 30px rgba(57, 255, 20, 0.2)',
  }))

  const avatarImg = document.createElement('img')
  avatarImg.src = ctx.profile.profile_image_url
  avatarImg.alt = ctx.profile.display_name
  Object.assign(avatarImg.style, {
    width: '64px', height: '64px', borderRadius: '50%',
    border: '2px solid var(--accent-green)',
  })
  card.appendChild(avatarImg)

  const infoDiv = document.createElement('div')
  const nameP = document.createElement('div')
  nameP.textContent = ctx.profile.display_name
  Object.assign(nameP.style, {
    fontFamily: 'var(--font-heading)', fontSize: '1.5rem',
    color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em',
  })
  infoDiv.appendChild(nameP)

  const statLine = document.createElement('div')
  statLine.textContent = [
    `${ctx.topClipCount} clips`,
    `${ctx.emoteCount} emotes`,
    ctx.topGame ? ctx.topGame.name : '',
  ].filter(Boolean).join(' / ')
  Object.assign(statLine.style, {
    fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
    color: 'var(--accent-green)', marginTop: '4px',
  })
  infoDiv.appendChild(statLine)
  card.appendChild(infoDiv)

  // Particle dots
  const particles: HTMLElement[] = []
  for (let i = 0; i < 30; i++) {
    const p = add(el('div', {
      position: 'absolute',
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      width: '4px',
      height: '4px',
      borderRadius: '50%',
      background: 'var(--accent-green)',
      opacity: '0',
    }))
    particles.push(p)
  }

  const tl = createTimeline({
    autoplay: false,
    defaults: { ease: 'outExpo' },
  })

  // Matrix rain down
  tl.add(columns, {
    top: ['-20%', '120%'],
    opacity: [0.7, 0],
    duration: 2500,
    delay: stagger(80, { from: 'center' }),
    ease: 'linear',
  })

  // Particles appear
  tl.add(particles, {
    opacity: [0, 1],
    scale: [0, 1.5],
    duration: 400,
    delay: stagger(30),
  }, 800)

  // Particles converge to center
  tl.add(particles, {
    top: '50%',
    left: '50%',
    opacity: [1, 0],
    scale: [1.5, 0],
    duration: 600,
    delay: stagger(20),
    ease: 'inExpo',
  }, 1300)

  // Card materializes
  tl.add(card, {
    opacity: [0, 1],
    scale: [0.8, 1],
    duration: 800,
    ease: 'outBack',
  }, 1900)

  tl.play()

  return {
    timeline: tl,
    cleanup: () => created.forEach((n) => n.remove()),
  }
}

// ---------------------------------------------------------------------------
// Template: Hype
// ---------------------------------------------------------------------------

const hypeTemplate: IntroTemplateFn = (container, ctx) => {
  const created: HTMLElement[] = []
  const add = (node: HTMLElement) => {
    container.appendChild(node)
    created.push(node)
    return node
  }

  const accentColor = ctx.isLive ? '#FF4444' : 'var(--accent-twitch)'
  const accentGlow = ctx.isLive ? 'rgba(255, 68, 68, 0.4)' : 'var(--accent-twitch-glow)'

  // Pulsing background ring
  const ring = add(el('div', {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '200px',
    height: '200px',
    borderRadius: '50%',
    border: `3px solid ${accentColor}`,
    boxShadow: `0 0 40px ${accentGlow}`,
    opacity: '0',
  }))

  // LIVE badge
  const liveBadge = ctx.isLive
    ? add(el('div', {
        position: 'absolute',
        top: '25%',
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: 'var(--font-heading)',
        fontSize: '1.2rem',
        color: '#FF4444',
        letterSpacing: '0.3em',
        textTransform: 'uppercase',
        opacity: '0',
        textShadow: '0 0 10px rgba(255, 68, 68, 0.6)',
      }, '\u25CF LIVE'))
    : null

  // Avatar
  const avatar = add(el('div', {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    overflow: 'hidden',
    opacity: '0',
  }))
  const img = document.createElement('img')
  img.src = ctx.profile.profile_image_url
  img.alt = ctx.profile.display_name
  Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' })
  avatar.appendChild(img)

  // Name
  const name = add(el('div', {
    position: 'absolute',
    top: '62%',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'var(--font-heading)',
    fontSize: '2.5rem',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    whiteSpace: 'nowrap',
    opacity: '0',
  }, ctx.profile.display_name))

  // Fast-cut stat flashes
  const statTexts = [
    `${ctx.topClipCount} CLIPS`,
    `${ctx.emoteCount} EMOTES`,
    ctx.topGame ? ctx.topGame.name.toUpperCase() : 'NO GAME',
    ctx.isLive ? `${formatNumber(ctx.stream?.viewer_count ?? 0)} VIEWERS` : `${formatNumber(ctx.profile.view_count)} VIEWS`,
  ]

  const flashEls = statTexts.map((text) =>
    add(el('div', {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      fontFamily: 'var(--font-heading)',
      fontSize: '3.5rem',
      color: accentColor,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      whiteSpace: 'nowrap',
      opacity: '0',
      textShadow: `0 0 20px ${accentGlow}`,
    }, text)),
  )

  // Viewer count ticker
  const ticker = ctx.isLive
    ? add(el('div', {
        position: 'absolute',
        top: '75%',
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: 'var(--font-mono)',
        fontSize: '1.8rem',
        color: '#FF4444',
        opacity: '0',
        whiteSpace: 'nowrap',
      }, '0'))
    : null

  const tl = createTimeline({
    autoplay: false,
    defaults: { ease: 'outExpo' },
  })

  // Fast stat flashes — rapid cuts
  flashEls.forEach((flashEl, i) => {
    tl.add(flashEl, {
      opacity: [0, 1],
      scale: [1.5, 1],
      duration: 150,
    }, i * 200)

    tl.add(flashEl, {
      opacity: [1, 0],
      duration: 100,
      ease: 'linear',
    }, i * 200 + 150)
  })

  const flashEnd = flashEls.length * 200 + 150

  // Ring pulse in
  tl.add(ring, {
    opacity: [0, 1],
    scale: [0.5, 1],
    duration: 600,
  }, flashEnd)

  // Ring pulse animation
  tl.add(ring, {
    scale: [1, 1.3],
    opacity: [1, 0],
    duration: 800,
    ease: 'inOutQuad',
  }, flashEnd + 400)

  // Avatar slam
  tl.add(avatar, {
    opacity: [0, 1],
    scale: [2, 1],
    duration: 400,
  }, flashEnd + 200)

  // Live badge
  if (liveBadge) {
    tl.add(liveBadge, {
      opacity: [0, 1],
      translateY: [-20, 0],
      duration: 400,
    }, flashEnd + 400)
  }

  // Name
  tl.add(name, {
    opacity: [0, 1],
    translateY: [30, 0],
    duration: 500,
  }, flashEnd + 500)

  // Viewer ticker count up
  if (ticker && ctx.stream) {
    const viewerCount = ctx.stream.viewer_count
    const obj = { val: 0 }
    tl.add(obj, {
      val: [0, viewerCount],
      duration: 1000,
      ease: 'outExpo',
      onUpdate: () => {
        ticker.textContent = `${formatNumber(Math.round(obj.val))} watching`
      },
    }, flashEnd + 600)

    tl.add(ticker, {
      opacity: [0, 1],
      duration: 300,
    }, flashEnd + 600)
  }

  tl.play()

  return {
    timeline: tl,
    cleanup: () => created.forEach((n) => n.remove()),
  }
}

// ---------------------------------------------------------------------------
// Template: Minimal
// ---------------------------------------------------------------------------

const minimalTemplate: IntroTemplateFn = (container, ctx) => {
  const created: HTMLElement[] = []
  const add = (node: HTMLElement) => {
    container.appendChild(node)
    created.push(node)
    return node
  }

  // Avatar
  const avatar = add(el('div', {
    position: 'absolute',
    top: '50%',
    left: '42%',
    transform: 'translate(-50%, -50%)',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    overflow: 'hidden',
    opacity: '0',
    border: '2px solid var(--accent-twitch)',
  }))
  const img = document.createElement('img')
  img.src = ctx.profile.profile_image_url
  img.alt = ctx.profile.display_name
  Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' })
  avatar.appendChild(img)

  // Name — types in
  const nameContainer = add(el('div', {
    position: 'absolute',
    top: '50%',
    left: '46%',
    transform: 'translateY(-70%)',
    fontFamily: 'var(--font-heading)',
    fontSize: '1.6rem',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    width: '0',
  }))
  nameContainer.textContent = ctx.profile.display_name

  // Stat line
  const statLine = add(el('div', {
    position: 'absolute',
    top: '50%',
    left: '46%',
    transform: 'translateY(30%)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    color: 'var(--accent-green)',
    whiteSpace: 'nowrap',
    opacity: '0',
    letterSpacing: '0.1em',
  }, [
    ctx.isLive ? 'LIVE' : 'OFFLINE',
    ctx.topGame ? ctx.topGame.name : null,
    `${ctx.emoteCount} emotes`,
  ].filter(Boolean).join(' \u00B7 ')))

  // Cursor blink
  const cursor = add(el('span', {
    position: 'absolute',
    top: '50%',
    left: '46%',
    transform: 'translateY(-70%)',
    fontFamily: 'var(--font-heading)',
    fontSize: '1.6rem',
    color: 'var(--accent-green)',
    opacity: '0',
  }, '|'))

  const tl = createTimeline({
    autoplay: false,
    defaults: { ease: 'outExpo' },
  })

  // Avatar slides in from left
  tl.add(avatar, {
    opacity: [0, 1],
    translateX: [-40, 0],
    duration: 400,
  })

  // Cursor appears
  tl.add(cursor, {
    opacity: [0, 1],
    duration: 100,
  }, 200)

  // Name types in (width reveal)
  const nameWidth = ctx.profile.display_name.length * 20 // approximate
  tl.add(nameContainer, {
    width: [0, nameWidth],
    duration: ctx.profile.display_name.length * 50,
    ease: 'steps(' + ctx.profile.display_name.length + ')',
  }, 300)

  // Move cursor along
  tl.add(cursor, {
    left: [`46%`, `${46 + (nameWidth / window.innerWidth) * 100}%`],
    duration: ctx.profile.display_name.length * 50,
    ease: 'steps(' + ctx.profile.display_name.length + ')',
  }, 300)

  // Cursor blink then hide
  tl.add(cursor, {
    opacity: [1, 0, 1, 0],
    duration: 400,
    ease: 'steps(4)',
  }, 300 + ctx.profile.display_name.length * 50)

  // Stat line fade in
  tl.add(statLine, {
    opacity: [0, 1],
    translateX: [10, 0],
    duration: 300,
  }, 300 + ctx.profile.display_name.length * 50 + 100)

  tl.play()

  return {
    timeline: tl,
    cleanup: () => created.forEach((n) => n.remove()),
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const INTRO_TEMPLATES = {
  glitch: glitchTemplate,
  cinematic: cinematicTemplate,
  dataStorm: dataStormTemplate,
  hype: hypeTemplate,
  minimal: minimalTemplate,
} as const

export type IntroTemplateName = keyof typeof INTRO_TEMPLATES

export const TEMPLATE_NAMES: IntroTemplateName[] = Object.keys(INTRO_TEMPLATES) as IntroTemplateName[]

export function getRandomTemplate(exclude?: IntroTemplateName): IntroTemplateName {
  const available = TEMPLATE_NAMES.filter((t) => t !== exclude)
  return available[Math.floor(Math.random() * available.length)]
}
