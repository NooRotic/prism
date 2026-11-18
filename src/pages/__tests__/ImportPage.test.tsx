import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { getWatchLater, setWatchLater } from '../../lib/catchupStore'
import { getRecommended } from '../../lib/recommendedStore'
import ImportPage from '../ImportPage'

const IDS = ['dQw4w9WgXcQ', 'jNQXAC9IVRw']

function renderAt(hash: string) {
  return render(
    <MemoryRouter initialEntries={[`/import${hash}`]}>
      <Routes>
        <Route path="/import" element={<ImportPage />} />
        <Route path="/youtube/catchup" element={<div>catch up page</div>} />
        <Route path="/twitch" element={<div>twitch page</div>} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => localStorage.clear())

describe('ImportPage: Watch Later from the helper', () => {
  const hash = `#v=1&kind=watch-later&ids=${IDS.join(',')}`

  it('says what was sent and stores nothing until the owner agrees', () => {
    renderAt(hash)
    expect(screen.getByText(/sent 2 Watch Later videos/)).toBeInTheDocument()
    expect(getWatchLater()).toEqual([])
  })

  it('saves the list and opens Catch up on Save', () => {
    renderAt(hash)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(getWatchLater()).toEqual(IDS)
    expect(screen.getByText('catch up page')).toBeInTheDocument()
  })

  it('warns that Save replaces a list that is already saved', () => {
    setWatchLater(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'])
    renderAt(hash)
    expect(screen.getByText(/replaces the 3 videos/)).toBeInTheDocument()
  })

  it('leaves everything alone on Dismiss', () => {
    setWatchLater(['aaaaaaaaaaa'])
    renderAt(hash)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(getWatchLater()).toEqual(['aaaaaaaaaaa'])
    expect(screen.getByText('home page')).toBeInTheDocument()
  })
})

describe('ImportPage: Twitch recommended channels from the helper', () => {
  it('saves the channels and opens the Twitch page on Save', () => {
    renderAt('#v=1&kind=twitch-recommended&logins=ogre_jpg,zedxyr')
    expect(screen.getByText(/sent 2 recommended Twitch channels/)).toBeInTheDocument()
    expect(getRecommended()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(getRecommended()?.logins).toEqual(['ogre_jpg', 'zedxyr'])
    expect(screen.getByText('twitch page')).toBeInTheDocument()
  })
})

describe('ImportPage: nothing usable', () => {
  it.each([[''], ['#v=1&kind=watch-later&ids=junk'], ['#v=9&kind=watch-later&ids=dQw4w9WgXcQ']])(
    'says there is nothing to import for %j',
    (hash) => {
      renderAt(hash)
      expect(screen.getByText(/Nothing to import/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    },
  )
})
