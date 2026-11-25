import { act, render, screen } from '@testing-library/react'
import CastProvider from '../CastProvider'
import { useCast } from '../castContext'
import { createCastSender } from '../../../lib/cast/castSender'
import { installFakeCast } from '../../../lib/cast/__tests__/fakeCast'

function Probe() {
  const cast = useCast()
  return (
    <>
      <output>{`${cast.available} ${cast.connected} ${cast.device ?? '-'}`}</output>
      <button type="button" onClick={cast.load}>
        load
      </button>
    </>
  )
}

afterEach(() => vi.unstubAllGlobals())

it('gives a working nothing without a provider', () => {
  render(<Probe />)
  screen.getByRole('button').click()
  expect(screen.getByRole('status')).toHaveTextContent('false false -')
})

it('shares one sender and follows it', () => {
  document.head.innerHTML = ''
  const fake = installFakeCast()
  const sender = createCastSender()
  render(
    <CastProvider sender={sender}>
      <Probe />
    </CastProvider>,
  )
  screen.getByRole('button').click()
  act(() => {
    fake.sdkReady()
    fake.castState('NOT_CONNECTED')
    fake.sessionStarted('Living room')
  })
  expect(screen.getByRole('status')).toHaveTextContent('true true Living room')
})
