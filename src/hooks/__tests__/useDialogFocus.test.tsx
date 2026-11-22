import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState, type RefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useDialogFocus } from '../useDialogFocus'

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, onClose)
  return (
    <div ref={ref} role="dialog" aria-label="Box">
      <input aria-label="First" />
      <button type="button">Middle</button>
      <button type="button">Last</button>
    </div>
  )
}

function Page({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Opener
      </button>
      {open && (
        <Dialog
          onClose={() => {
            onClose()
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

const openIt = () => {
  const opener = screen.getByRole('button', { name: 'Opener' })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

describe('useDialogFocus', () => {
  it('moves focus into the dialog when it opens', () => {
    render(<Page />)
    openIt()
    expect(screen.getByLabelText('First')).toHaveFocus()
  })

  it('keeps Tab inside: forward from the last goes to the first, back from the first goes to the last', () => {
    render(<Page />)
    openIt()
    screen.getByRole('button', { name: 'Last' }).focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(screen.getByLabelText('First')).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('closes on Esc wherever focus is', () => {
    const onClose = vi.fn()
    render(<Page onClose={onClose} />)
    openIt()
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('gives focus back to the button that opened it', () => {
    render(<Page />)
    const opener = openIt()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('leaves Esc to an input method that is composing text', () => {
    const onClose = vi.fn()
    render(<Page onClose={onClose} />)
    openIt()
    fireEvent.keyDown(screen.getByLabelText('First'), { key: 'Escape', isComposing: true })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('falls back to a given button when the opener has left the page, or was never focused (Safari)', () => {
    const { unmount } = render(<Fallback startFromBody={false} />)
    const suggestion = screen.getByRole('button', { name: 'Suggestion' })
    suggestion.focus()
    fireEvent.click(suggestion)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Main' })).toHaveFocus()
    unmount()

    render(<Fallback startFromBody />)
    fireEvent.click(screen.getByRole('button', { name: 'Suggestion' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Main' })).toHaveFocus()
  })
})

function SaveBox({ onClose, onSave, fallback }: { onClose: () => void; onSave: () => void; fallback: RefObject<HTMLButtonElement | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, onClose, fallback)
  return (
    <div ref={ref} role="dialog" aria-label="Box">
      <button type="button" onClick={onSave}>
        Save
      </button>
    </div>
  )
}

function Fallback({ startFromBody }: { startFromBody: boolean }) {
  const [open, setOpen] = useState(false)
  const [offer, setOffer] = useState(true)
  const main = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={main} type="button">
        Main
      </button>
      {offer && (
        <button
          type="button"
          onClick={() => {
            if (startFromBody) (document.activeElement as HTMLElement | null)?.blur()
            setOpen(true)
          }}
        >
          Suggestion
        </button>
      )}
      {open && <SaveBox onClose={() => setOpen(false)} onSave={() => setOffer(false)} fallback={main} />}
    </>
  )
}
