import { useRef, useEffect, useCallback, useState } from 'react'
import { animate } from 'animejs'
import { useApp } from '../../contexts/AppContext'
import {
  INTRO_TEMPLATES,
  type IntroContext,
  type IntroTemplateName,
  type IntroResult,
} from '../../lib/introTemplates'

interface ChannelIntroProps {
  onComplete: () => void
  onSkip: () => void
  template?: IntroTemplateName
}

export function ChannelIntro({ onComplete, onSkip, template = 'glitch' }: ChannelIntroProps) {
  const { state } = useApp()
  const { channel } = state
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const introRef = useRef<IntroResult | null>(null)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const completedRef = useRef(false)

  const buildContext = useCallback((): IntroContext | null => {
    if (!channel.profile || !channel.channelInfo) return null

    // Find the most-played game
    let topGame = null
    if (channel.games.size > 0) {
      const firstGameId = channel.channelInfo.game_id
      topGame = channel.games.get(firstGameId) ?? [...channel.games.values()][0] ?? null
    }

    // Build clip thumbnail list from top clips
    const clipThumbnails = channel.clips
      .sort((a, b) => b.view_count - a.view_count)
      .slice(0, 6)
      .map((clip) => ({
        url: clip.thumbnail_url,
        title: clip.title,
        views: clip.view_count,
      }))

    return {
      profile: channel.profile,
      channelInfo: channel.channelInfo,
      stream: channel.stream,
      isLive: channel.isLive,
      topClipCount: channel.clips.length,
      emoteCount: channel.emotes.length,
      badgeCount: channel.badges.length,
      topGame,
      clipThumbnails,
    }
  }, [channel])

  const handleComplete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true

    setIsFadingOut(true)

    // Fade out the overlay
    if (overlayRef.current) {
      animate(overlayRef.current, {
        opacity: [1, 0],
        duration: 400,
        ease: 'inQuad',
        onComplete: () => {
          introRef.current?.cleanup()
          introRef.current = null
          onComplete()
        },
      })
    } else {
      introRef.current?.cleanup()
      introRef.current = null
      onComplete()
    }
  }, [onComplete])

  const handleSkip = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true

    // Immediately clean up
    introRef.current?.cleanup()
    introRef.current = null

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

    const ctx = buildContext()
    if (!ctx) {
      onComplete()
      return
    }

    completedRef.current = false

    const templateFn = INTRO_TEMPLATES[template]
    const result = templateFn(container, ctx)
    introRef.current = result

    // Listen for timeline completion
    // anime.js v4 timelines: check when all animations finish
    const checkComplete = () => {
      // Use a timeout based on the timeline duration to trigger complete
      // anime.js v4 timeline exposes .duration
      const duration = (result.timeline as unknown as { duration: number }).duration ?? 5000
      setTimeout(() => {
        if (!completedRef.current) {
          handleComplete()
        }
      }, duration + 200) // small buffer
    }

    checkComplete()

    return () => {
      introRef.current?.cleanup()
      introRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template])

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'var(--bg)',
        overflow: 'hidden',
        opacity: isFadingOut ? undefined : 1,
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
        }}
      />

      {/* Skip button */}
      <button
        onClick={handleSkip}
        style={{
          position: 'absolute',
          bottom: '2rem',
          right: '2rem',
          zIndex: 60,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.35)',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '4px',
          padding: '0.4rem 0.8rem',
          cursor: 'pointer',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
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
