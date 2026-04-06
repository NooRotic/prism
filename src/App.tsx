function App() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <h1
          className="text-xl font-bold tracking-wider"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--accent-green)' }}
        >
          GLAZE ME
        </h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search channel..."
            className="bg-[var(--bg-card)] border border-[var(--accent-twitch)] rounded px-3 py-1.5 text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] w-64 focus:outline-none focus:border-[var(--accent-green)]"
          />
          <button className="bg-[var(--accent-twitch)] text-white text-sm px-4 py-1.5 rounded hover:opacity-90 transition-opacity">
            Login with Twitch
          </button>
        </div>
      </header>

      <main className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="text-center">
          <h2
            className="text-4xl font-bold mb-4"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--accent-green)' }}
          >
            GLAZE ME
          </h2>
          <p className="text-[var(--text-secondary)] text-lg mb-6">
            Twitch Channel Streamer Highlighter
          </p>
          <p className="text-[var(--text-muted)] text-sm">
            Enter a Twitch channel name above to get started
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
