import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChatHeader from '../ChatHeader'
import ChatStrip from '../ChatStrip'

const textSize = {
  scale: 1,
  canSmaller: true,
  canLarger: true,
  onSmaller: vi.fn(),
  onLarger: vi.fn(),
  onReset: vi.fn(),
}

function header(fillControls?: boolean) {
  return (
    <ChatHeader
      side="right"
      onHide={vi.fn()}
      onSwapSide={vi.fn()}
      onPopOut={vi.fn()}
      fill={false}
      onToggleFill={vi.fn()}
      fullscreenSupported
      isFullscreen={false}
      onToggleFullscreen={vi.fn()}
      textSize={textSize}
      dragHandleProps={{}}
      {...(fillControls === undefined ? {} : { fillControls })}
    />
  )
}

function strip(fillControls?: boolean) {
  return (
    <ChatStrip
      side="right"
      restoreLabel="Show chat"
      onRestore={vi.fn()}
      fill={false}
      onToggleFill={vi.fn()}
      fullscreenSupported
      isFullscreen={false}
      onToggleFullscreen={vi.fn()}
      {...(fillControls === undefined ? {} : { fillControls })}
    />
  )
}

describe('ChatHeader fillControls', () => {
  it('shows Fill and Fullscreen by default', () => {
    render(header())
    expect(screen.getByRole('button', { name: 'Fill video & chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fullscreen chat and video' })).toBeInTheDocument()
    // The selector the offline layout's "no grip" test relies on really does find the grip.
    expect(screen.getByTestId('chat-header').querySelector('svg.lucide-grip-vertical')).not.toBeNull()
  })

  it('hides Fill and Fullscreen when false, and keeps hide and pop out', () => {
    render(header(false))
    expect(screen.queryByRole('button', { name: /fill/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Hide chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pop out chat' })).toBeInTheDocument()
  })
})

describe('ChatStrip fillControls', () => {
  it('shows Fill and Fullscreen by default', () => {
    render(strip())
    expect(screen.getByRole('button', { name: 'Fill window' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fullscreen chat and video' })).toBeInTheDocument()
  })

  it('hides Fill and Fullscreen when false, and keeps the restore tab', () => {
    render(strip(false))
    expect(screen.queryByRole('button', { name: /fill/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show chat' })).toBeInTheDocument()
  })
})
