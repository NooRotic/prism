import type { ReactNode } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { useYoutubeAccount } from '../../hooks/useYoutubeAccount'
import { importYoutubeSubscriptions } from '../../lib/youtubeImport'
import { CountedNote } from '../ui/CountedNote'

const TEXT = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.03em' } as const
const HISTORY_URL = 'https://www.youtube.com/feed/history'

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function subscriptions(n: number): string {
  return `${n} subscription${n === 1 ? '' : 's'}`
}

/**
 * Each platform's sign-in, in the header's second row. Twitch: who is signed in, Sign out or Connect.
 * YouTube: what the one-time import brought in and from which account, Import or Re-import, and a link to the
 * viewer's own YouTube history (watching here is recorded under whoever is signed in to youtube.com in this browser,
 * which PRISM cannot see). PRISM keeps no Google sign-in, so there is nothing to sign out of, and it never offers to.
 * Last, what is counted: this row is the one place on every page a visitor can find it.
 */
export function AccountsRow({ showDebugToggle }: { showDebugToggle: boolean }) {
  return (
    <div className="flex w-full flex-col gap-2 py-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-6">
      <TwitchAccount />
      <YoutubeAccount />
      {showDebugToggle && <DebugToggle />}
      <CountedNote className="w-full text-xs sm:text-right text-[var(--text-secondary)]" />
    </div>
  )
}

function Entry({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section aria-label={name} className="flex items-center justify-between gap-3 sm:justify-start" style={TEXT}>
      {children}
    </section>
  )
}

function Who({ name, picture, color, detail }: { name: string; picture?: string; color: string; detail: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {picture ? (
        <img src={picture} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span className="min-w-0">
        <span style={{ color: 'var(--text-primary)' }}>{name}</span>{' '}
        <span style={{ color: 'var(--text-muted)' }}>·</span> <span style={{ color: 'var(--text-secondary)' }}>{detail}</span>
      </span>
    </span>
  )
}

function ActionButton({ children, onClick, disabled, strong }: { children: ReactNode; onClick(): void; disabled?: boolean; strong?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 transition-colors duration-150 hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
      style={strong ? { background: strong, color: '#fff', border: '1px solid transparent' } : { border: '1px solid var(--border-accent)', color: 'var(--text-secondary)' }}
    >
      {children}
    </button>
  )
}

function TwitchAccount() {
  const { isAuthenticated, login, logout } = useTwitchAuth()
  const { state } = useApp()
  const user = isAuthenticated ? state.auth.user : null

  if (isAuthenticated) {
    return (
      <Entry name="Twitch">
        <Who
          name="Twitch"
          picture={user?.profile_image_url || undefined}
          color="var(--accent-twitch)"
          detail={user?.display_name ? `Signed in as ${user.display_name}` : 'Signed in'}
        />
        <ActionButton onClick={logout}>Sign out</ActionButton>
      </Entry>
    )
  }
  return (
    <Entry name="Twitch">
      <Who name="Twitch" color="var(--border-accent)" detail={state.auth.expired ? 'Your Twitch session ended' : 'Not signed in'} />
      <ActionButton onClick={login} strong="linear-gradient(135deg, var(--accent-twitch), #7b2ff2)">
        Connect
      </ActionButton>
    </Entry>
  )
}

function YoutubeAccount() {
  const youtube = useYoutubeAccount()
  // The reason an import failed lives with the import, not in this row: another row can replace this one while it runs.
  const { failure } = youtube

  let detail: string
  if (youtube.account) {
    const from = youtube.account.title ? ` from ${youtube.account.title}` : ''
    detail = `${subscriptions(youtube.subscriptionCount)}${from}, imported ${formatDay(youtube.account.importedAt)}`
  } else if (youtube.subscriptionCount > 0) {
    detail = `${subscriptions(youtube.subscriptionCount)} imported`
  } else {
    detail = 'Subscriptions not imported'
  }

  return (
    <Entry name="YouTube">
      <span className="flex min-w-0 flex-col gap-0.5">
        <Who name="YouTube" picture={youtube.account?.thumbnailUrl || undefined} color={youtube.imported ? 'var(--accent-youtube)' : 'var(--border-accent)'} detail={detail} />
        <span className="pl-4 text-[0.6875rem]" style={{ color: 'var(--text-muted)' }}>
          {failure && (
            <span role="status" className="mr-2" style={{ color: 'var(--accent-orange)' }}>
              {failure}
            </span>
          )}
          <a href={HISTORY_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--text-secondary)]">
            History: check on youtube.com ↗
          </a>
        </span>
      </span>
      {youtube.configured ? (
        <ActionButton onClick={() => void importYoutubeSubscriptions()} disabled={youtube.importing}>
          {youtube.importing ? 'Importing…' : youtube.imported ? 'Re-import' : 'Import'}
        </ActionButton>
      ) : (
        <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>
          Import isn't set up in this build
        </span>
      )}
    </Entry>
  )
}

function DebugToggle() {
  const { state, dispatch } = useApp()
  const on = state.player.debugMode
  return (
    <Entry name="Debug">
      <span style={{ color: 'var(--text-secondary)' }}>Debug overlay</span>
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_DEBUG' })}
        aria-label="Toggle debug overlay"
        aria-pressed={on}
        className="rounded-md px-2.5 py-1"
        style={{ border: `1px solid ${on ? 'var(--accent-green)' : 'var(--border-accent)'}`, color: on ? 'var(--accent-green)' : 'var(--text-secondary)' }}
      >
        {on ? 'On' : 'Off'}
      </button>
    </Entry>
  )
}
