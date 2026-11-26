import PrismIcon from '../components/cast/PrismIcon'

/**
 * The TV page opened in a browser that is not a Cast device (a computer, or a TV's own browser): it cannot play here, so it
 * says what it is and points to the help page. Google's receiver script is not loaded. `failed`: on a Cast device whose
 * receiver script did not load, the one thing to do is to cast again.
 */
export default function NotOnDevice({ failed = false }: { failed?: boolean }) {
  return (
    <div className="tv-start">
      <PrismIcon className="tv-start-mark-icon" />
      <p className="tv-start-name">PRISM</p>
      {failed ? (
        <p className="tv-small">Google&apos;s Cast player did not load. Cast PRISM to this TV again.</p>
      ) : (
        <>
          <p className="tv-small">This is PRISM&apos;s TV page. It runs when you cast PRISM to a TV</p>
          <a className="tv-start-link" href="/">
            What is PRISM?
          </a>
        </>
      )}
    </div>
  )
}
