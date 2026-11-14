import { useCallback, useEffect, useMemo, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import AdminShell from '../components/admin/AdminShell'
import { AdminSessionContext } from '../components/admin/AdminSessionContext'
import ChannelsScreen from '../components/admin/ChannelsScreen'
import OverviewScreen from '../components/admin/OverviewScreen'
import PlaylistScreen from '../components/admin/PlaylistScreen'
import SecurityScreen from '../components/admin/SecurityScreen'
import SignInCard from '../components/admin/SignInCard'
import TtCallsScreen from '../components/admin/TtCallsScreen'
import UsageScreen from '../components/admin/UsageScreen'
import { getSession, type AdminSession } from '../lib/adminApi'
import { clearAdminToken, endAdminSession, getAdminToken, startAdminSignIn } from '../lib/adminAuth'

type Gate =
  | { status: 'checking' }
  | { status: 'signed_out'; expired: boolean }
  | { status: 'refused'; recorded: boolean }
  | { status: 'unavailable' }
  | { status: 'ready'; session: AdminSession }

/**
 * The owner's admin pages. Without a valid owner token this shows a sign-in card and nothing else; the server
 * decides who is the owner, this page only reflects its answer. It sits outside the site layout (no header, no
 * rail, no viewer sign-in) and is its own chunk, so a visitor never downloads it.
 */
export default function AdminPage() {
  const { pathname } = useLocation()
  const [gate, setGate] = useState<Gate>(() => (getAdminToken() ? { status: 'checking' } : { status: 'signed_out', expired: false }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!getAdminToken()) return
    const controller = new AbortController()
    void getSession(controller.signal).then((result) => {
      if (controller.signal.aborted) return
      switch (result.kind) {
        case 'ok':
          setGate({ status: 'ready', session: result.data })
          break
        case 'signed_out':
          clearAdminToken()
          setGate({ status: 'signed_out', expired: true })
          break
        case 'refused':
          setGate({ status: 'refused', recorded: result.recorded })
          break
        default:
          setGate({ status: 'unavailable' })
      }
    })
    return () => controller.abort()
  }, [attempt])

  const signOut = useCallback(() => {
    endAdminSession() // revokes the token at Twitch, then forgets it
    setGate({ status: 'signed_out', expired: false })
  }, [])
  const onExpired = useCallback(() => {
    clearAdminToken()
    setGate({ status: 'signed_out', expired: true })
  }, [])
  const retry = useCallback(() => {
    setGate({ status: 'checking' })
    setAttempt((n) => n + 1)
  }, [])

  const sessionValue = useMemo(() => (gate.status === 'ready' ? { limits: gate.session.limits, onExpired } : null), [gate, onExpired])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      {gate.status === 'checking' && (
        <p role="status" className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
          Checking your admin sign-in…
        </p>
      )}
      {gate.status === 'signed_out' && <SignInCard expired={gate.expired} onSignIn={() => startAdminSignIn(pathname)} />}
      {gate.status === 'refused' && (
        <section className="mx-auto mt-24 max-w-md rounded-lg border p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
          <p>{gate.recorded ? 'This page is only for the site owner. Your Twitch name was recorded.' : 'This page is only for the site owner.'}</p>
          <button type="button" onClick={signOut} className="mt-4 rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
            Sign out
          </button>
        </section>
      )}
      {gate.status === 'unavailable' && (
        <section className="mx-auto mt-24 max-w-md rounded-lg border p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
          <p>The history server is not answering right now.</p>
          <button type="button" onClick={retry} className="mt-4 rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
            Try again
          </button>
        </section>
      )}
      {gate.status === 'ready' && sessionValue !== null && (
        <AdminSessionContext.Provider value={sessionValue}>
          <AdminShell onSignOut={signOut}>
            <Routes>
              <Route index element={<OverviewScreen />} />
              <Route path="usage" element={<UsageScreen />} />
              <Route path="tt" element={<TtCallsScreen />} />
              <Route path="security" element={<SecurityScreen />} />
              <Route path="channels" element={<ChannelsScreen />} />
              <Route path="playlist" element={<PlaylistScreen />} />
              <Route path="*" element={<p>That admin page does not exist.</p>} />
            </Routes>
          </AdminShell>
        </AdminSessionContext.Provider>
      )}
    </div>
  )
}
