import { lazy, Suspense, type ReactElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import HubPage from './pages/HubPage'
import ProtocolPage from './pages/ProtocolPage'
import TwitchPlayerPage from './pages/TwitchPlayerPage'
import YoutubePlayerPage from './pages/YoutubePlayerPage'
import HlsDashPlayerPage from './pages/HlsDashPlayerPage'
import ChatPopoutPage from './pages/ChatPopoutPage'
import NotFoundPage from './pages/NotFoundPage'

// The owner's admin pages are their own chunk: a visitor never downloads them, only a sign-in prompt is ever shown without the owner's token.
const AdminPage = lazy(() => import('./pages/AdminPage'))

interface AppRoutesProps {
  /** Wraps every page except the chat pop-out (header, panels, rail). Must render an `<Outlet />`. */
  layout: ReactElement
}

/**
 * The route table, apart from `App` so it can be tested without the layout's providers.
 * Anything no route matches lands on the not-found page, inside the layout.
 */
export default function AppRoutes({ layout }: AppRoutesProps) {
  return (
    <Routes>
      {/* The chat pop-out is a window of its own, so it sits outside the layout
          and carries none of the page chrome. */}
      <Route path="chat/:channel" element={<ChatPopoutPage />} />
      {/* The owner's admin pages: outside the layout too, so no header, rail or viewer sign-in runs there. */}
      <Route
        path="admin/*"
        element={
          <Suspense fallback={<p className="p-8 text-center">Loading…</p>}>
            <AdminPage />
          </Suspense>
        }
      />
      <Route element={layout}>
        <Route index element={<HubPage />} />
        <Route path="twitch" element={<ProtocolPage protocol="twitch" />} />
        <Route path="twitch/:channel" element={<TwitchPlayerPage />} />
        <Route path="youtube" element={<ProtocolPage protocol="youtube" />} />
        <Route path="youtube/:videoId" element={<YoutubePlayerPage />} />
        <Route path="hls-dash" element={<ProtocolPage protocol="hls-dash" />} />
        <Route path="hls-dash/:streamId" element={<HlsDashPlayerPage />} />
        {/* Inside the layout on purpose: the header, the rail and a floating video window
            survive a mistyped address. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
