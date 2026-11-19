import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PopoutPlayerPage from '../PopoutPlayerPage'
import { POPOUT_FAILED_MESSAGE } from '../../lib/floatingVideo'

type HostProps = { url: string; detection: { type: string }; renderError?: (e: string | null) => React.ReactNode }
let lastHost: HostProps | null = null
vi.mock('../../components/player/PlayerHost', () => ({
  default: (props: HostProps) => {
    lastHost = props
    return <div data-testid="player">{props.url}</div>
  },
}))

/** In a frame the page's parent is the floating window's document; jsdom has none, so give it one. */
function frameWithParent() {
  const post = vi.fn()
  vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: post } as unknown as Window)
  return post
}

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/popout/player${search}`]}>
      <PopoutPlayerPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  lastHost = null
  vi.restoreAllMocks()
})

describe('PopoutPlayerPage', () => {
  it('plays a YouTube video as a watch address', () => {
    renderAt('?kind=youtube&v=abcdefghijk')
    expect(screen.getByTestId('player').textContent).toBe('https://www.youtube.com/watch?v=abcdefghijk')
    expect(lastHost?.detection.type).toBe('youtube')
  })

  it('starts a YouTube video at the time it was given', () => {
    renderAt('?kind=youtube&v=abcdefghijk&t=95')
    expect(screen.getByTestId('player').textContent).toBe('https://www.youtube.com/watch?v=abcdefghijk&t=95s')
  })

  it('plays a stream as the type it was told, not the one its address suggests', () => {
    renderAt('?kind=stream&as=dash&url=https%3A%2F%2Fa.example%2Fplaylist')
    expect(screen.getByTestId('player').textContent).toBe('https://a.example/playlist')
    expect(lastHost?.detection.type).toBe('dash')
  })

  it('shows nothing to play for an address it does not understand, and tells the opener', () => {
    const post = frameWithParent()
    renderAt('?kind=stream&as=hls&url=javascript%3Aalert(1)')
    expect(screen.queryByTestId('player')).toBeNull()
    expect(post).toHaveBeenCalledWith({ type: POPOUT_FAILED_MESSAGE }, window.location.origin)
  })

  it('tells the opener when no player can play it', () => {
    const post = frameWithParent()
    renderAt('?kind=youtube&v=abcdefghijk')
    render(<>{lastHost?.renderError?.('boom')}</>)
    expect(post).toHaveBeenCalledWith({ type: POPOUT_FAILED_MESSAGE }, window.location.origin)
  })
})
