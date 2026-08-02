import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AuthGate from './components/AuthGate'
import { AuthProvider } from './hooks/useAuth'
import './tailwind.css'
import './styles.css'
import './business/business.css'

// Self-heal old '#/app' and '#/admin' bookmarks (user management moved to the
// Hub at ecofutures.uk/retrofit-suite/team). Both were Job Manager URLs, so
// they land on the jobs board — '#/' is the Dashboard now, and sending an old
// bookmark there would quietly change what it does.
// Listens for hashchange too, since a same-document hash-only navigation
// (e.g. a bookmark clicked while the tab is already open) never re-runs
// this module's top-level code.
function healHash() {
  if (window.location.hash.startsWith('#/app') || window.location.hash.startsWith('#/admin')) {
    window.location.replace('#/jobs')
  }
}
healHash()
window.addEventListener('hashchange', healHash)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate><App /></AuthGate>
    </AuthProvider>
  </React.StrictMode>,
)
