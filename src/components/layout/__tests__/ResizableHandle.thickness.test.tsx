import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResizableHandle } from '../ResizableHandle'

describe('ResizableHandle thickness', () => {
  it('is 8px thick by default, in either direction', () => {
    const { rerender } = render(<ResizableHandle direction="vertical" label="h" onResize={() => {}} />)
    expect(screen.getByRole('separator', { name: 'h' })).toHaveStyle({ height: '8px' })
    rerender(<ResizableHandle direction="horizontal" label="w" onResize={() => {}} />)
    expect(screen.getByRole('separator', { name: 'w' })).toHaveStyle({ width: '8px' })
  })

  it('takes the given thickness, so a bar can be a finger-sized target', () => {
    const { rerender } = render(
      <ResizableHandle direction="vertical" label="h" thickness={24} onResize={() => {}} />,
    )
    expect(screen.getByRole('separator', { name: 'h' })).toHaveStyle({ height: '24px' })
    rerender(<ResizableHandle direction="horizontal" label="w" thickness={24} onResize={() => {}} />)
    expect(screen.getByRole('separator', { name: 'w' })).toHaveStyle({ width: '24px' })
  })
})
