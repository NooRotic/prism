import type { CSSProperties, ReactNode } from 'react'

// Literal class strings, because Tailwind cannot see classes built from pieces.
// The inner box is shrunk to 1/scale and then scaled back up from the top left, so
// it ends up exactly the size of its container with bigger text. Never CSS `zoom`:
// measured, it produced a box that overflowed.
const UNSCALED = 'w-full h-full'
const SCALED_FROM_MD =
  'w-full h-full md:origin-top-left md:[transform:scale(var(--chat-scale))] md:w-[calc(100%/var(--chat-scale))] md:h-[calc(100%/var(--chat-scale))]'
const SCALED_ALWAYS =
  'origin-top-left [transform:scale(var(--chat-scale))] w-[calc(100%/var(--chat-scale))] h-[calc(100%/var(--chat-scale))]'

interface ScaledChatProps {
  scale: number
  children: ReactNode
  /** Scale at every width (the pop-out). By default only from md, where the controls are. */
  always?: boolean
}

/**
 * Makes the chat's text bigger or smaller from outside, by scaling the whole box.
 * The wrapper is the same two elements whatever the size, so changing it only
 * changes classes and never reloads the chat iframe. At the default size no
 * transform is applied at all.
 */
export default function ScaledChat({ scale, children, always = false }: ScaledChatProps) {
  const className = scale === 1 ? UNSCALED : always ? SCALED_ALWAYS : SCALED_FROM_MD
  return (
    <div data-testid="scaled-chat" className="overflow-hidden w-full h-full">
      <div
        data-testid="scaled-chat-inner"
        className={className}
        style={{ '--chat-scale': scale } as CSSProperties}
      >
        {children}
      </div>
    </div>
  )
}
