import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { getRandomTemplate, type IntroTemplateName } from '../lib/introTemplates'

const STORAGE_KEY = 'glaze_intros_seen'

interface IntrosSeen {
  [channelName: string]: IntroTemplateName
}

function loadSeen(): IntrosSeen {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as IntrosSeen
  } catch {
    return {}
  }
}

function saveSeen(data: IntrosSeen): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export interface IntroState {
  showIntro: boolean
  currentTemplate: IntroTemplateName
  hasSeenIntro: boolean
  triggerRemix: () => void
  completeIntro: () => void
  skipIntro: () => void
}

export function useIntroState(channelLogin: string | null): IntroState {
  const seen = useMemo(() => loadSeen(), [])
  const channelKey = channelLogin?.toLowerCase() ?? ''

  const hasSeenBefore = channelKey !== '' && channelKey in seen
  const previousTemplate = hasSeenBefore ? seen[channelKey] : undefined

  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (!channelKey) return false
    return true
  })

  const [currentTemplate, setCurrentTemplate] = useState<IntroTemplateName>(() => {
    if (hasSeenBefore && previousTemplate) {
      // For return visits, pick a different one in case of remix
      return getRandomTemplate(previousTemplate)
    }
    return getRandomTemplate()
  })

  // Reset intro state whenever the user navigates to a different channel.
  // useState initializers run once on mount, so without this effect switching
  // channels mid-session would leave stale showIntro/currentTemplate values.
  // We track the last-seen channelKey in a ref so we only reset on a real
  // transition (not on the very first mount, which the useState initializers
  // already handle).
  const lastChannelKeyRef = useRef(channelKey)
  useEffect(() => {
    if (lastChannelKeyRef.current === channelKey) return
    lastChannelKeyRef.current = channelKey
    if (!channelKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on channel unload
      setShowIntro(false)
      return
    }
    // New channel: pick a fresh template (different from last if we have one
    // cached) and show the intro. This gives every channel selection the
    // remix animation the user expects.
    const nextTemplate = getRandomTemplate(previousTemplate)
    setCurrentTemplate(nextTemplate)
    setShowIntro(true)
  }, [channelKey, previousTemplate])

  const markSeen = useCallback(
    (template: IntroTemplateName) => {
      if (!channelKey) return
      const current = loadSeen()
      current[channelKey] = template
      saveSeen(current)
    },
    [channelKey],
  )

  const completeIntro = useCallback(() => {
    setShowIntro(false)
    markSeen(currentTemplate)
  }, [currentTemplate, markSeen])

  const skipIntro = useCallback(() => {
    setShowIntro(false)
    markSeen(currentTemplate)
  }, [currentTemplate, markSeen])

  const triggerRemix = useCallback(() => {
    const next = getRandomTemplate(currentTemplate)
    setCurrentTemplate(next)
    setShowIntro(true)
  }, [currentTemplate])

  return {
    showIntro,
    currentTemplate,
    hasSeenIntro: hasSeenBefore,
    triggerRemix,
    completeIntro,
    skipIntro,
  }
}
