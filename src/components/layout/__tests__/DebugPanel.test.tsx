import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import DebugPanel from '../DebugPanel'

function DebugToggle() {
  const { dispatch } = useApp()
  return (
    <button onClick={() => dispatch({ type: 'TOGGLE_DEBUG' })}>
      toggle from test
    </button>
  )
}

function renderPanel() {
  return render(
    <AppProvider>
      <DebugToggle />
      <DebugPanel />
    </AppProvider>,
  )
}

describe('DebugPanel', () => {
  // The shipped default is the whole point of this file: the panel used to
  // mount open on every page load with no obvious way to dismiss it.
  it('renders nothing on a fresh app state', () => {
    renderPanel()
    expect(screen.queryByLabelText('Debug Panel')).not.toBeInTheDocument()
  })

  it('appears once debug mode is switched on', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByText('toggle from test'))
    expect(screen.getByLabelText('Debug Panel')).toBeInTheDocument()
  })

  it('exposes a close button that dismisses the panel', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByText('toggle from test'))
    await user.click(screen.getByLabelText('Close debug panel'))

    expect(screen.queryByLabelText('Debug Panel')).not.toBeInTheDocument()
  })
})
