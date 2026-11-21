const WORD = '(?:latest|newest|recent)'
const NOUN = '(?:videos?|uploads?)'

const PATTERNS = [
  new RegExp(`^${WORD}\\s+${NOUN}\\s+(?:from|by|of)\\s+(.+)$`, 'i'), // latest video from X
  new RegExp(`^${WORD}\\s+(.+?)(?:\\s+${NOUN})?$`, 'i'), // latest X [video]
  new RegExp(`^(.+?)\\s+${WORD}(?:\\s+${NOUN})?$`, 'i'), // X latest [video]
]

/**
 * The channel name in a "latest <youtuber> video" question, or null when the text is anything else
 * (an ordinary search). Understands "latest X", "latest X video(s)", "X latest video", "latest video from X"
 * with latest / newest / recent.
 */
export function parseLatestQuery(text: string): string | null {
  const q = text.trim().replace(/\s+/g, ' ')
  for (const pattern of PATTERNS) {
    const name = pattern.exec(q)?.[1]?.trim()
    if (name && !new RegExp(`^${NOUN}$`, 'i').test(name)) return name
  }
  return null
}
