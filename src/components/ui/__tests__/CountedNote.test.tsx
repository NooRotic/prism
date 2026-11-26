import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CountedNote } from '../CountedNote'

const flags = vi.hoisted(() => ({ send: true }))
vi.mock('../../../config/historyServer', () => ({
  get SEND_VISITS() {
    return flags.send
  },
}))

const COUNTED = 'Visits, and what is played or linked, are counted by Matomo on my own server, with no cookies and shortened IP addresses.'
const UNCOUNTED = 'Page opens are counted, with nothing about you.'

beforeEach(() => {
  flags.send = true
})

describe('CountedNote', () => {
  it('has a sentence for a visitor Matomo counts and one for a visitor it does not; CSS shows one of them', () => {
    render(<CountedNote />)

    expect(screen.getByText(COUNTED)).toHaveClass('counted-note')
    expect(screen.getByText(UNCOUNTED)).toHaveClass('uncounted-note')
  })

  it('leaves the second out of a development build, which counts nothing', () => {
    flags.send = false
    render(<CountedNote />)

    expect(screen.getByText(COUNTED)).toBeInTheDocument()
    expect(screen.queryByText(UNCOUNTED)).not.toBeInTheDocument()
  })

  it('takes its own classes, so it fits where it is placed', () => {
    render(<CountedNote className="w-full text-xs" />)

    for (const text of [COUNTED, UNCOUNTED]) expect(screen.getByText(text)).toHaveClass('w-full', 'text-xs')
  })
})
