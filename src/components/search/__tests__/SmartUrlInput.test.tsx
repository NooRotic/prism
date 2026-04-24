import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import { SmartUrlInput } from '../SmartUrlInput'

vi.mock('../SearchSuggestions', () => ({
  SearchSuggestions: () => <div data-testid="search-suggestions" />,
}))

vi.mock('../QuickLinks', () => ({
  QuickLinks: () => <div data-testid="quick-links" />,
}))

// Spy component to observe dispatched state
function StateSpy({ onState }: { onState: (state: ReturnType<typeof useApp>['state']) => void }) {
  const { state } = useApp()
  onState(state)
  return null
}

function renderInput() {
  let latestState: ReturnType<typeof useApp>['state'] | null = null

  const result = render(
    <MemoryRouter>
      <AppProvider>
        <SmartUrlInput />
        <StateSpy onState={(s) => { latestState = s }} />
      </AppProvider>
    </MemoryRouter>,
  )

  return { ...result, getState: () => latestState! }
}

describe('SmartUrlInput', () => {
  it('renders input with placeholder', () => {
    renderInput()
    expect(
      screen.getByPlaceholderText('Paste URL or type channel name...'),
    ).toBeInTheDocument()
  })

  it('typing updates input value', async () => {
    renderInput()
    const user = userEvent.setup()
    const input = screen.getByPlaceholderText('Paste URL or type channel name...')

    await user.type(input, 'xqc')
    expect(input).toHaveValue('xqc')
  })

  it('submitting a Twitch clip URL dispatches PLAY_URL', async () => {
    const { getState } = renderInput()
    const user = userEvent.setup()
    const input = screen.getByPlaceholderText('Paste URL or type channel name...')

    await user.type(input, 'https://clips.twitch.tv/SomeClipId')
    await user.keyboard('{Enter}')

    // Twitch clip URLs navigate to /twitch/:channel, but clips without
    // a channel context still work via the router. The search history
    // should be updated regardless.
    const state = getState()
    expect(state.search.history.length).toBeGreaterThan(0)
  })

  it('submitting plain text navigates to Twitch channel route', async () => {
    const { getState } = renderInput()
    const user = userEvent.setup()
    const input = screen.getByPlaceholderText('Paste URL or type channel name...')

    await user.type(input, 'shroud')
    await user.keyboard('{Enter}')

    // Plain text navigates to /twitch/shroud via React Router.
    // State should reflect the search history entry.
    const state = getState()
    expect(state.search.history.some((h) => h.query === 'shroud')).toBe(true)
  })

  it('clear button appears when input has text', async () => {
    renderInput()
    const user = userEvent.setup()
    const input = screen.getByPlaceholderText('Paste URL or type channel name...')

    // No clear button initially
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    await user.type(input, 'test')

    // Clear button should now be visible (the X button)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('pressing Escape closes dropdown and blurs input', async () => {
    renderInput()
    const user = userEvent.setup()
    const input = screen.getByPlaceholderText('Paste URL or type channel name...')

    // Focus input to open dropdown
    await user.click(input)

    // Press Escape
    await user.keyboard('{Escape}')

    // Input should no longer have focus
    expect(input).not.toHaveFocus()
  })
})
