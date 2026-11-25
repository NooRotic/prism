import { Cast } from 'lucide-react'
import type { TvState } from '../../lib/cast/messages'
import { STRIP_BUTTON_LOOK } from '../chat/ChatTab'
import { useCast } from './castContext'

const WORDS: Record<TvState, string> = {
  tuning: 'Tuning…',
  playing: 'Playing',
  buffering: 'Buffering…',
  paused: 'Paused',
  failed: 'Not available',
  ended: 'Finished',
  idle: 'Nothing playing',
}

const BUTTON = `${STRIP_BUTTON_LOOK} h-9 px-4 text-sm`
const FRAME = 'flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg p-4 text-center'
const FRAME_STYLE = { backgroundColor: '#000', border: '2px solid var(--accent-hls)', color: 'var(--text-secondary)' } as const

/**
 * Where the player was, while the stream plays on a TV: what the TV is on (it follows the remote) and the controls. `refused`
 * says why the page's own stream did not go to the TV, when it cannot.
 */
export default function CastPanel({ refused }: { refused: string | null }) {
  const { device, now, togglePause, stop } = useCast()
  const canPause = now !== null && (now.state === 'playing' || now.state === 'paused' || now.state === 'buffering')
  return (
    <div data-testid="cast-panel" className={FRAME} style={FRAME_STYLE}>
      <Cast size={32} aria-hidden="true" />
      <p className="text-sm">{`Playing on ${device ?? 'the TV'}`}</p>
      {now?.name && (
        <p className="max-w-full truncate text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {now.name}
        </p>
      )}
      <p role="status" data-testid="cast-state" className="text-sm">
        {now ? WORDS[now.state] : 'Connecting…'}
      </p>
      {refused && (
        <p role="status" className="text-sm" style={{ color: 'var(--accent-orange)' }}>
          {refused}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {canPause && (
          <button type="button" onClick={togglePause} className={BUTTON}>
            {now.state === 'paused' ? 'Play' : 'Pause'}
          </button>
        )}
        <button type="button" onClick={stop} className={BUTTON}>
          Stop casting
        </button>
      </div>
    </div>
  )
}

/** After a cast that ended without Stop being pressed here: the computer makes no sound until it is asked to. */
export function CastEndedPanel({ onPlayHere }: { onPlayHere(): void }) {
  return (
    <div className={FRAME} style={FRAME_STYLE}>
      <Cast size={32} aria-hidden="true" />
      <p className="text-sm">Casting ended</p>
      <button type="button" onClick={onPlayHere} className={BUTTON}>
        Play here
      </button>
    </div>
  )
}
