interface SignInCardProps {
  /** True when the owner had a session that ended (an expired Twitch token), so the card says so. */
  expired: boolean
  onSignIn: () => void
}

/** The only thing anyone sees at /admin without a valid owner token. It says plainly what signing in records. */
export default function SignInCard({ expired, onSignIn }: SignInCardProps) {
  return (
    <section className="mx-auto mt-24 max-w-md rounded-lg border p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
      <h1 className="font-heading text-xl" style={{ color: 'var(--accent-green)' }}>
        PRISM admin
      </h1>
      {expired && (
        <p className="mt-3 text-sm" role="status" style={{ color: 'var(--accent-gold)' }}>
          Your admin session ended. Sign in again.
        </p>
      )}
      <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        This page is only for the site owner. Signing in records the Twitch name of anyone who is not the owner.
      </p>
      <button
        type="button"
        onClick={onSignIn}
        className="mt-5 rounded px-4 py-2 text-sm font-semibold"
        style={{ background: 'var(--accent-twitch)', color: '#fff' }}
      >
        Sign in as admin
      </button>
    </section>
  )
}
