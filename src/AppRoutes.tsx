import type { ReactElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import HubPage from './pages/HubPage'
import ProtocolPage from './pages/ProtocolPage'
import TwitchPlayerPage from './pages/TwitchPlayerPage'
import YoutubePlayerPage from './pages/YoutubePlayerPage'
import HlsDashPlayerPage from './pages/HlsDashPlayerPage'
import ChatPopoutPage from './pages/ChatPopoutPage'
import NotFoundPage from './pages/NotFoundPage'

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
