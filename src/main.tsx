import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  // StrictMode removed — video.js modifies the DOM in ways that
  // conflict with React 19's double-invoke cleanup. The removeChild
  // crash is dev-only (StrictMode is stripped in production) but
  // breaks the entire player subtree during development.
  <App />,
)
