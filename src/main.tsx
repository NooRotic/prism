import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { finishAdminSignIn } from './lib/adminAuth'

// Twitch sends the owner's admin sign-in back to the site root: take that callback before the router (and the
// viewer sign-in) look at the address. A viewer's sign-in callback is left alone.
finishAdminSignIn()

createRoot(document.getElementById('root')!).render(
  // StrictMode removed — video.js modifies the DOM in ways that
  // conflict with React 19's double-invoke cleanup. The removeChild
  // crash is dev-only (StrictMode is stripped in production) but
  // breaks the entire player subtree during development.
  <App />,
)
