import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useTwitchAuth } from '../useTwitchAuth'

// Many components call useTwitchAuth at once (Header, the favorites card, the
// layout that loads the profile ...). They must all agree on whether the user is
// signed in, so these tests render two real callers, a parent and a child, under
// the real AppProvider. The child's effects run first, which is what decides who
// gets to consume the one-shot OAuth redirect.

const renders: string[] = []

function Caller({ id, children }: { id: string; children?: ReactNode }) {
  const { isAuthenticated, logout } = useTwitchAuth()
  renders.push(`${id}:${isAuthenticated ? 'in' : 'out'}`)
  return (
    <div>
      <span data-testid={id}>{isAuthenticated ? 'signed in' : 'signed out'}</span>
      <button onClick={logout}>log out from {id}</button>
      {children}
    </div>
  )
}

function ExpireSession() {
  const { dispatch } = useApp()
  return <button onClick={() => dispatch({ type: 'TOKEN_EXPIRED' })}>expire</button>
}

function mount() {
  return render(
    <AppProvider>
      <Caller id="layout">
        <Caller id="header" />
      </Caller>
      <ExpireSession />
    </AppProvider>,
  )
}

describe('useTwitchAuth', () => {
  beforeEach(() => {
    renders.length = 0
    localStorage.clear()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('tells every caller about the login that follows the OAuth redirect', () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_TWITCH_OAUTH_STATE, 'abc')
    window.history.replaceState(null, '', '/#access_token=tok&state=abc')

    mount()

    expect(screen.getByTestId('header')).toHaveTextContent('signed in')
    expect(screen.getByTestId('layout')).toHaveTextContent('signed in')
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)).toBe('tok')
    expect(window.location.hash).toBe('')
  })

  it('starts every caller signed in, with no signed-out frame, when a token is stored', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')

    mount()

    expect(screen.getByTestId('header')).toHaveTextContent('signed in')
    expect(screen.getByTestId('layout')).toHaveTextContent('signed in')
    expect(renders.filter((r) => r.endsWith(':out'))).toEqual([])
  })

  it('stays signed out for every caller when there is no token', () => {
    mount()

    expect(screen.getByTestId('header')).toHaveTextContent('signed out')
    expect(screen.getByTestId('layout')).toHaveTextContent('signed out')
  })

  it('signs every caller out when one of them logs out', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')
    mount()

    fireEvent.click(screen.getByText('log out from header'))

    expect(screen.getByTestId('header')).toHaveTextContent('signed out')
    expect(screen.getByTestId('layout')).toHaveTextContent('signed out')
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)).toBeNull()
  })

  it('signs every caller out when the session expires elsewhere in the app', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')
    mount()

    fireEvent.click(screen.getByText('expire'))

    expect(screen.getByTestId('header')).toHaveTextContent('signed out')
    expect(screen.getByTestId('layout')).toHaveTextContent('signed out')
  })
})
