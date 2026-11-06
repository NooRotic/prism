import { fireEvent, render, screen } from '@testing-library/react'
import ChatHeader from '../ChatHeader'
import ChatStrip from '../ChatStrip'
import FloatingBar from '../FloatingBar'
import FloatingPanel from '../FloatingPanel'
import VideoPopoutButton from '../VideoPopoutButton'

const FLOATING_TEXT = 'The video is in a floating window'

/** True when `first` comes before `second` in the document. */
function isBefore(first: HTMLElement, second: HTMLElement) {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('VideoPopoutButton', () => {
  it('offers to pop the video out while it is in the page', () => {
    render(<VideoPopoutButton floating={false} onClick={vi.fn()} className="x" />)
    expect(screen.getByRole('button', { name: 'Pop out video' })).toBeInTheDocument()
  })

  it('offers to bring the video back while it floats', () => {
    render(<VideoPopoutButton floating onClick={vi.fn()} className="x" />)
    expect(screen.getByRole('button', { name: 'Bring video back' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pop out video' })).not.toBeInTheDocument()
  })

  it('calls its handler when clicked', () => {
    const onClick = vi.fn()
    render(<VideoPopoutButton floating={false} onClick={onClick} className="x" />)
    fireEvent.click(screen.getByRole('button', { name: 'Pop out video' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('FloatingBar', () => {
  it('is a slim bar that only exists below the md breakpoint', () => {
    render(<FloatingBar floating onClick={vi.fn()} />)
    expect(screen.getByTestId('floating-bar')).toHaveClass('md:hidden')
  })

  it('says the video is floating and offers to bring it back', () => {
    const onClick = vi.fn()
    render(<FloatingBar floating onClick={onClick} />)

    expect(screen.getByText(FLOATING_TEXT)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bring video back' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('offers only the pop out button while the video is in the page', () => {
    render(<FloatingBar floating={false} onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Pop out video' })).toBeInTheDocument()
    expect(screen.queryByText(FLOATING_TEXT)).not.toBeInTheDocument()
  })
})

describe('FloatingPanel', () => {
  it('stands in for the video, and brings it back on request', () => {
    const onBringBack = vi.fn()
    render(<FloatingPanel onBringBack={onBringBack} />)

    expect(screen.getByText(FLOATING_TEXT)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bring video back' }))
    expect(onBringBack).toHaveBeenCalledOnce()
  })
})

function renderHeader(overrides: Partial<React.ComponentProps<typeof ChatHeader>> = {}) {
  const props: React.ComponentProps<typeof ChatHeader> = {
    side: 'right',
    onHide: vi.fn(),
    onSwapSide: vi.fn(),
    onPopOut: vi.fn(),
    fill: false,
    onToggleFill: vi.fn(),
    fullscreenSupported: true,
    isFullscreen: false,
    onToggleFullscreen: vi.fn(),
    textSize: {
      scale: 1,
      canSmaller: true,
      canLarger: true,
      onSmaller: vi.fn(),
      onLarger: vi.fn(),
      onReset: vi.fn(),
    },
    dragHandleProps: {},
    ...overrides,
  }
  render(<ChatHeader {...props} />)
  return props
}

describe('ChatHeader video control', () => {
  it('shows Pop out video, just before Pop out chat, and calls its handler', () => {
    const onClick = vi.fn()
    renderHeader({ videoControl: { floating: false, onClick } })

    const videoButton = screen.getByRole('button', { name: 'Pop out video' })
    expect(isBefore(videoButton, screen.getByRole('button', { name: 'Pop out chat' }))).toBe(true)
    fireEvent.click(videoButton)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows Bring video back while the video floats', () => {
    renderHeader({ videoControl: { floating: true, onClick: vi.fn() } })
    expect(screen.getByRole('button', { name: 'Bring video back' })).toBeInTheDocument()
  })

  it('shows neither without a video control', () => {
    renderHeader()
    expect(screen.queryByRole('button', { name: 'Pop out video' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bring video back' })).not.toBeInTheDocument()
  })

  it('keeps the dock-side controls normally', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: 'Move chat to the left' })).toBeInTheDocument()
    expect(screen.getByTitle('Drag to dock the chat on the other side')).toBeInTheDocument()
  })

  it('drops the dock-side controls when told the dock has no sides to swap', () => {
    renderHeader({ dockControls: false })
    expect(screen.queryByRole('button', { name: /Move chat to the/ })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Drag to dock the chat on the other side')).not.toBeInTheDocument()
  })
})

function renderStrip(overrides: Partial<React.ComponentProps<typeof ChatStrip>> = {}) {
  const props: React.ComponentProps<typeof ChatStrip> = {
    side: 'right',
    restoreLabel: 'Show chat',
    onRestore: vi.fn(),
    fill: false,
    onToggleFill: vi.fn(),
    fullscreenSupported: true,
    isFullscreen: false,
    onToggleFullscreen: vi.fn(),
    ...overrides,
  }
  render(<ChatStrip {...props} />)
  return props
}

describe('ChatStrip video control', () => {
  it('shows the video button before the restore tab and calls its handler', () => {
    const onClick = vi.fn()
    renderStrip({ videoControl: { floating: false, onClick } })

    const videoButton = screen.getByRole('button', { name: 'Pop out video' })
    expect(isBefore(videoButton, screen.getByRole('button', { name: 'Show chat' }))).toBe(true)
    fireEvent.click(videoButton)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows Bring video back while the video floats', () => {
    renderStrip({ videoControl: { floating: true, onClick: vi.fn() } })
    expect(screen.getByRole('button', { name: 'Bring video back' })).toBeInTheDocument()
  })

  it('is unchanged without a video control', () => {
    renderStrip()
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Fill window',
      'Fullscreen chat and video',
      'Show chat',
    ])
  })
})
