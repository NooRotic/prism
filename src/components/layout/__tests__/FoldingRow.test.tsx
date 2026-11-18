import { fireEvent, render } from '@testing-library/react'
import { createRef } from 'react'
import type { HeaderRow } from '../../../hooks/useHeaderRow'
import { ROW_CLOSED } from '../../../lib/headerRow'
import { FoldingRow } from '../FoldingRow'

const ROW: HeaderRow = {
  state: ROW_CLOSED,
  tabHoverProps: () => ({ onPointerEnter: () => {}, onPointerLeave: () => {} }),
  rowHoverProps: { onPointerEnter: () => {}, onPointerLeave: () => {} },
  press: () => {},
}

function renderRow(open: boolean) {
  const rowRef = createRef<HTMLDivElement>()
  const tree = (o: boolean) => (
    <FoldingRow open={o} row={ROW} rowRef={rowRef}>
      <button type="button">inside</button>
    </FoldingRow>
  )
  const utils = render(tree(open))
  const outer = () => document.getElementById('header-row') as HTMLElement
  const clip = () => outer().firstElementChild as HTMLElement
  return { ...utils, outer, clip, setOpen: (o: boolean) => utils.rerender(tree(o)) }
}

// While the row unfolds it clips its content; only once it has settled open may drop-downs (Browse) hang out of it.
// Anything drawn over the page while it grows would cover the player (Twitch pauses a covered embed).
describe('FoldingRow', () => {
  it('lets content hang out only once it has settled open', () => {
    const { outer, clip } = renderRow(true)
    expect(clip()).toHaveClass('overflow-hidden')

    fireEvent.transitionEnd(outer())

    expect(clip()).toHaveClass('overflow-visible')
  })

  it('clips again when it re-opens before its fold finished', () => {
    const { outer, clip, setOpen } = renderRow(true)
    fireEvent.transitionEnd(outer())
    setOpen(false)

    setOpen(true)

    expect(clip()).toHaveClass('overflow-hidden')
  })
})
