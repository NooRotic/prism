import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../../../contexts/AppContext'
import { SmartUrlInput } from '../SmartUrlInput'

// Signed out with no search history: no top categories, no suggestions. Both parts draw nothing.
vi.mock('../SearchSuggestions', () => ({ SearchSuggestions: () => null }))
vi.mock('../QuickLinks', () => ({ QuickLinks: () => null }))

function Harness() {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <SmartUrlInput active listContainer={slot} onDone={() => {}} />
      <div data-testid="slot" ref={setSlot} />
    </>
  )
}

describe('the header paste box with nothing to suggest', () => {
  it('draws a list box that stays hidden, so it does not push the page down', async () => {
    render(
      <MemoryRouter>
        <AppProvider>
          <Harness />
        </AppProvider>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByPlaceholderText(/paste url/i))

    const box = screen.getByTestId('slot').firstElementChild as HTMLElement
    expect(box).not.toBeNull()
    // Nothing inside, and `empty:hidden` turns that into display: none (its border and margin go with it).
    expect(box).toBeEmptyDOMElement()
    expect(box.className).toContain('empty:hidden')
  })
})
