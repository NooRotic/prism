import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import { SmartUrlInput } from '../SmartUrlInput'

vi.mock('../SearchSuggestions', () => ({
  SearchSuggestions: () => <div data-testid="search-suggestions" />,
}))

// Like the real quick links: mousedown is cancelled so the box keeps focus while one is picked.
vi.mock('../QuickLinks', () => ({
  QuickLinks: ({ onSelect }: { onSelect: (name: string) => void }) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onSelect('Just Chatting')}>
      Just Chatting
    </button>
  ),
}))

function StateSpy() {
  const { state } = useApp()
  return <output data-testid="nav-panel">{state.navPanel.open ?? 'none'}</output>
}

function Harness({ active, onDone }: { active: boolean; onDone: () => void }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div data-testid="box">
        <SmartUrlInput active={active} onDone={onDone} listContainer={slot} />
      </div>
      <div data-testid="slot" ref={setSlot} />
      <button type="button">elsewhere</button>
    </>
  )
}

function renderHarness(active: boolean, onDone = vi.fn()) {
  const tree = (a: boolean) => (
    <MemoryRouter>
      <AppProvider>
        <Harness active={a} onDone={onDone} />
        <StateSpy />
      </AppProvider>
    </MemoryRouter>
  )
  const utils = render(tree(active))
  return { ...utils, onDone, setActive: (a: boolean) => utils.rerender(tree(a)) }
}

const input = () => screen.getByPlaceholderText('Paste URL or type channel name...')

describe('SmartUrlInput in the header', () => {
  it('draws the quick links into the given container, not under the box', async () => {
    const { setActive } = renderHarness(false)
    setActive(true)

    expect(input()).toHaveFocus()
    const slot = screen.getByTestId('slot')
    expect(within(slot).getByRole('button', { name: 'Just Chatting' })).toBeInTheDocument()
    expect(within(screen.getByTestId('box')).queryByRole('button', { name: 'Just Chatting' })).toBeNull()
  })

  it('opens empty and focused when it becomes active, even after an old search', async () => {
    const { setActive } = renderHarness(false)
    await userEvent.type(input(), 'old search')
    act(() => input().blur())

    setActive(true)

    expect(input()).toHaveValue('')
    expect(input()).toHaveFocus()
  })

  it('calls onDone after a quick link, and the quick link still works', async () => {
    const { setActive, onDone } = renderHarness(false)
    setActive(true)

    await userEvent.click(within(screen.getByTestId('slot')).getByRole('button', { name: 'Just Chatting' }))

    expect(screen.getByTestId('nav-panel')).toHaveTextContent('category')
    expect(onDone).toHaveBeenCalledWith('submit')
  })

  it('calls onDone on Esc', async () => {
    const { setActive, onDone } = renderHarness(false)
    setActive(true)
    await userEvent.keyboard('{Escape}')
    expect(onDone).toHaveBeenCalledWith('escape')
  })

  it('calls onDone when focus leaves it empty, not when it holds text', async () => {
    const { setActive, onDone } = renderHarness(false)
    setActive(true)
    await userEvent.type(input(), 'twitch.tv/x')
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(onDone).not.toHaveBeenCalled()

    await userEvent.click(input())
    await userEvent.clear(input())
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(onDone).toHaveBeenCalledWith('blur')
  })

  it('takes its list away when it stops being active', () => {
    const { setActive } = renderHarness(false)
    setActive(true)
    expect(within(screen.getByTestId('slot')).getByRole('button', { name: 'Just Chatting' })).toBeInTheDocument()

    setActive(false)

    expect(within(screen.getByTestId('slot')).queryByRole('button', { name: 'Just Chatting' })).toBeNull()
  })
})
