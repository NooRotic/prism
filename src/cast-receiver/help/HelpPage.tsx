import PrismIcon from '../../components/cast/PrismIcon'
import TvRing from '../TvRing'

const SITE = 'https://prism.nooroticx.tv'
const SECTIONS = [
  { name: 'Twitch', path: '/twitch', colour: '#9146FF', about: 'Live channels, the channels you follow, chat beside the video.' },
  { name: 'YouTube', path: '/youtube', colour: '#FF0000', about: 'Catch up on your subscriptions, Watch Later and live streams.' },
  { name: 'HLS / DASH', path: '/hls-dash', colour: '#3B82F6', about: 'Thousands of live channels, or any stream address you paste.' },
] as const

/**
 * prism-cast.nooroticx.tv opened in a browser: what PRISM is and where to go. Large enough to read on a TV, because casting
 * this page from Chrome's menu shows the same page there. Never loads Google's receiver script.
 */
export default function HelpPage() {
  return (
    <main className="help">
      <TvRing className="help-panel">
        <header className="help-head">
          <PrismIcon className="help-mark" />
          <h1 className="help-name">PRISM</h1>
        </header>
        <p className="help-lead">
          PRISM plays live streams in one place: Twitch, YouTube and HLS / DASH. Paste a link and it picks the right player, with chat
          and the details beside the video.
        </p>
        <nav className="help-links" aria-label="PRISM's sections">
          {SECTIONS.map((section) => (
            <a key={section.path} className="help-link" href={`${SITE}${section.path}`} style={{ borderColor: section.colour, color: section.colour }}>
              <span className="help-link-name">{section.name}</span>
              <span className="help-link-about">{section.about}</span>
            </a>
          ))}
        </nav>
        <p className="help-cast">To watch on your TV, open HLS / DASH in Chrome and press the Cast button</p>
        <p className="help-small">This address is the page PRISM shows on a TV while it is cast.</p>
      </TvRing>
    </main>
  )
}
