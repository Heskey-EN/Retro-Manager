// Tiny hash-router shim for the business (Finance) section. The tracker was
// written against react-router-dom paths ('/', '/finance', '/expenses',
// '/invoice/:id'); the merged app routes by location.hash instead, so this
// module maps those paths onto '#/finance…' and exports the same names the
// pages already import (Link, useNavigate) — the ported pages only change
// their import line.
//
//   tracker path            merged hash
//   '/'            (dash)   #/finance
//   '/finance'     (money)  #/finance/money
//   '/expenses'             #/finance/expenses
//   '/invoice/:id'          #/finance/invoice/:id
import { useEffect, useState } from 'react'

export function toHash(to) {
  if (!to || to === '/') return '#/finance'
  if (to === '/finance') return '#/finance/money'
  if (to === '/expenses') return '#/finance/expenses'
  if (to.startsWith('/invoice/')) return `#/finance/invoice/${to.slice('/invoice/'.length)}`
  return '#/finance'
}

// The business sub-route for a given location.hash (null = not a business route).
export function parseBizRoute(hash) {
  const h = (hash || '').replace(/^#/, '')
  if (h === '/finance' || h === '/finance/') return { page: 'dashboard' }
  if (h === '/finance/money') return { page: 'finance' }
  if (h === '/finance/expenses') return { page: 'expenses' }
  const m = h.match(/^\/finance\/invoice\/(.+)$/)
  if (m) return { page: 'invoice', id: decodeURIComponent(m[1]) }
  if (h.startsWith('/finance')) return { page: 'dashboard' } // unknown → dashboard
  return null
}

export function navigate(to) {
  window.location.hash = toHash(to)
}

export function useNavigate() {
  return navigate
}

export function useBizRoute() {
  const [route, setRoute] = useState(() => parseBizRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseBizRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

// Route params for the current business route (only invoices have one).
export function useParams() {
  const route = useBizRoute()
  return { id: route?.id }
}

export function Link({ to, children, ...props }) {
  return (
    <a href={toHash(to)} {...props}>
      {children}
    </a>
  )
}
