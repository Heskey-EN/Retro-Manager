import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { AlertTriangle, LayoutGrid, Plus, Search, Trash2 } from 'lucide-react'
import { useJobs } from './hooks/useJobs'
import { useAuth } from './hooks/useAuth'
import { storeMode } from './lib/jobsStore'
import { HUB_URL } from './lib/supabaseClient'
import { statusIndex, statusLabel, normalizeStatus } from './lib/status'
import { jobReference, jobPostcode, jobCustomer, jobMeasure, jobAddress } from './lib/display'
import {
  Banner, Button, EmptyState, Field, FilterChip, Input, Modal, Mono,
  SegmentedControl, Select, SpecLabel, Toast, cx, focusRingOnDark,
} from './ui'
import StatusBar from './components/StatusBar'
import CsvUpload from './components/CsvUpload'
import JobList from './components/JobList'
import ProjectsView from './components/ProjectsView'
import Calendar from './calendar/Calendar'
import JobView from './components/JobView'
import AddJobModal from './components/AddJobModal'
import BulkActionsBar from './components/BulkActionsBar'
import BulkCostingDialog from './components/BulkCostingDialog'
import BulkAssignDialog from './components/BulkAssignDialog'
import DashboardSection from './dashboard/DashboardSection'
import ImportReview from './components/ImportReview'
import { patchFor } from './lib/importMatch'
import TemplatesPage from './components/TemplatesPage'
import BusinessSection from './business/BusinessSection.jsx'
import MyExpenses from './business/pages/MyExpenses.jsx'

// Top-level sections, routed by location.hash:
//   '#/'            = Dashboard — the landing tab (quick add + what's coming up)
//   '#/jobs'        = the Job Manager board
//   '#/finance…'    = the merged-in Business Hub (admins only in suite mode)
//   '#/my-expenses' = worker expense logging
// The fallthrough is Dashboard, which also covers arriving with NO hash at all
// (the Hub launcher links to the bare origin).
function sectionFromHash() {
  const h = window.location.hash
  if (h.startsWith('#/finance')) return 'finance'
  if (h.startsWith('#/my-expenses')) return 'my-expenses'
  if (h.startsWith('#/jobs')) return 'jobs'
  return 'dashboard'
}

const SORTS = [
  { value: 'start', label: 'Soonest date' },
  { value: 'stage', label: 'Status' },
  { value: 'address', label: 'Address A–Z' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'added', label: 'Recently added' },
]

const VIEWS = [
  { value: 'list', label: 'Jobs' },
  { value: 'projects', label: 'Projects' },
  { value: 'calendar', label: 'Calendar' },
]

// The section tabs sit on the navy chrome, where the kit's light Button tones
// would disappear. They are links, not buttons — a tab that changes the URL
// must be openable in a new tab.
// min-h-11 on a phone: these are the app's primary navigation and were 40px,
// under the 44px a thumb needs. Dense only from sm: up, where there is a mouse.
const navLink =
  'inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-3.5 text-sm font-semibold ' +
  'no-underline transition-colors sm:min-h-10 ' + focusRingOnDark

// Order a list of jobs by the chosen key. Undated jobs sort last for date sorts.
function sortJobs(jobs, sortBy) {
  const arr = [...jobs]
  const start = (j) => j.start_date || ''
  const cmpStart = (a, b) => {
    const da = start(a), db = start(b)
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return da.localeCompare(db)
  }
  switch (sortBy) {
    case 'address':
      arr.sort((a, b) => jobAddress(a).localeCompare(jobAddress(b), 'en', { numeric: true }))
      break
    case 'stage':
      arr.sort((a, b) => statusIndex(a.status) - statusIndex(b.status) || cmpStart(a, b))
      break
    case 'updated':
      arr.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
      break
    case 'added':
      arr.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      break
    case 'start':
    default:
      arr.sort(cmpStart)
  }
  return arr
}

export default function App() {
  const { jobs, loading, error, addJobs, updateJob, deleteJobs, clearAll } = useJobs()
  // Suite access levels shape the UI; RLS in the hub project is the real
  // enforcement. Local mode (not configured) keeps everything available —
  // it's the user's own browser data.
  const { isAdmin, canDeleteJobs, configured, canSubmitExpenses } = useAuth()
  const mayDelete = !configured || canDeleteJobs
  const [section, setSection] = useState(sectionFromHash)
  const [view, setView] = useState('list')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [activeJob, setActiveJob] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  // The day a job is being added FOR, when it was started from a calendar cell.
  const [addDate, setAddDate] = useState('')
  const [scope, setScope] = useState('active')
  const [selectedTags, setSelectedTags] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [anchorId, setAnchorId] = useState(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false)
  const [costingOpen, setCostingOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [importReview, setImportReview] = useState(null)
  const [toast, setToast] = useState(null)
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('retrofit.sort') || 'start')
  const searchRef = useRef(null)
  const topbarRef = useRef(null)

  const pushToast = useCallback((t) => {
    setToast(t)
    window.clearTimeout(pushToast._t)
    pushToast._t = window.setTimeout(() => setToast(null), t?.action ? 7000 : 4500)
  }, [])

  useEffect(() => { localStorage.setItem('retrofit.sort', sortBy) }, [sortBy])

  // Publish the topbar's REAL height so the page can reserve space under it.
  //
  // Its height is not a constant: measured here, 143px on the Jobs tab and 99px
  // on the Dashboard at 375px, 65px at 700px. It wraps to three rows on a
  // phone, gains a row of actions on Jobs, and moves again when the web fonts
  // land. Anything that scrolls an element to the top of the page — an anchor
  // jump, focusing a field that is off screen, scrollIntoView — parked that
  // element UNDER the sticky bar, which is what the owner saw as "information
  // is behind the header". styles.css turns this into :root's
  // scroll-padding-top, so every such scroll stops below the bar at whatever
  // height it happens to be. A hard-coded number is wrong at some width,
  // always; that is the whole reason this is measured.
  const publishTopbarHeight = useCallback(() => {
    const el = topbarRef.current
    if (!el) return
    const value = `${Math.ceil(el.getBoundingClientRect().height)}px`
    const root = document.documentElement
    if (root.style.getPropertyValue('--topbar-h') !== value) root.style.setProperty('--topbar-h', value)
  }, [])

  // After EVERY render, with no dependency list: the bar gains and loses a row
  // with the section and with the signed-in user's permissions, and that is a
  // re-render rather than a resize. Writing only on a change keeps it cheap.
  useLayoutEffect(publishTopbarHeight)

  // The rest of the ways it can change without a re-render.
  useEffect(() => {
    const el = topbarRef.current
    if (!el) return undefined
    window.addEventListener('resize', publishTopbarHeight)
    window.addEventListener('orientationchange', publishTopbarHeight)
    // iOS resizes the visual viewport (keyboard, URL-bar collapse) without
    // always firing a window resize.
    window.visualViewport?.addEventListener('resize', publishTopbarHeight)
    window.addEventListener('pageshow', publishTopbarHeight) // back/forward cache restore
    // The precise version of the same thing, and the only one that catches a
    // row appearing from a child's own state.
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(publishTopbarHeight) : null
    ro?.observe(el)
    // Fonts land after first paint and change where the bar wraps.
    document.fonts?.ready.then(publishTopbarHeight).catch(() => {})
    // Belt and braces for the load window. The bar has been caught holding a
    // stale height right after a load — 154px recorded, 103px real — meaning
    // an early-load reflow (font swap, stylesheet landing) slipped past every
    // listener above. Too big only wastes scroll padding, but the same
    // staleness the other way hides content under the bar, which is the exact
    // bug all of this exists to prevent. So for the first few seconds,
    // re-measure every frame; one getBoundingClientRect a frame is nothing,
    // and it stops at settle.
    let raf = 0
    const started = performance.now()
    const watchdog = () => {
      publishTopbarHeight()
      if (performance.now() - started < 6000) raf = requestAnimationFrame(watchdog)
    }
    raf = requestAnimationFrame(watchdog)
    return () => {
      window.removeEventListener('resize', publishTopbarHeight)
      window.removeEventListener('orientationchange', publishTopbarHeight)
      window.visualViewport?.removeEventListener('resize', publishTopbarHeight)
      window.removeEventListener('pageshow', publishTopbarHeight)
      ro?.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [publishTopbarHeight])

  // Follow hash changes between the top-level sections.
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // A tab tap lands you at the TOP of that tab. Hash-only navigation keeps the
  // window's scroll offset, so tapping "Dashboard" halfway down a long Jobs
  // board dropped you halfway down the Dashboard — on a phone that reads as
  // the page having loaded wrong. Skipped on the very first render so a
  // deliberate reload-in-place is not fought.
  const firstSection = useRef(true)
  useEffect(() => {
    if (firstSection.current) { firstSection.current = false; return }
    window.scrollTo(0, 0)
  }, [section])

  // Finance is level 3–4 territory in suite mode (FinanceGate + RLS enforce
  // it); in local mode the tab shows and the per-device passcode protects it.
  const showFinanceTab = !configured || isAdmin
  const showMyExpensesTab = configured && !isAdmin && canSubmitExpenses

  const tabs = useMemo(() => [
    { key: 'dashboard', href: '#/', label: 'Dashboard' },
    { key: 'jobs', href: '#/jobs', label: 'Jobs' },
    showFinanceTab && { key: 'finance', href: '#/finance', label: 'Finance' },
    showMyExpensesTab && { key: 'my-expenses', href: '#/my-expenses', label: 'Expenses' },
  ].filter(Boolean), [showFinanceTab, showMyExpensesTab])

  const activeJobs = useMemo(() => jobs.filter((j) => !j.archived), [jobs])
  const archivedCount = jobs.length - activeJobs.length

  const allTags = useMemo(() => {
    const set = new Set()
    for (const j of jobs) for (const t of j.tags || []) set.add(t)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [jobs])

  const filtered = useMemo(() => {
    const base = scope === 'archived' ? jobs.filter((j) => j.archived) : activeJobs
    const q = query.trim().toLowerCase()
    return base.filter((job) => {
      // normalizeStatus so jobs still carrying old pipeline names filter correctly.
      if (statusFilter && normalizeStatus(job.status) !== statusFilter) return false
      if (selectedTags.length && !selectedTags.some((t) => (job.tags || []).includes(t))) return false
      if (!q) return true
      const haystack = [
        job.title, jobReference(job), jobPostcode(job), jobCustomer(job), jobMeasure(job),
        ...(job.tags || []), ...Object.values(job.data || {}),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [jobs, activeJobs, scope, query, statusFilter, selectedTags])

  const sorted = useMemo(() => sortJobs(filtered, sortBy), [filtered, sortBy])

  const hasFilters = !!query.trim() || !!statusFilter || selectedTags.length > 0
  const clearFilters = useCallback(() => {
    setQuery(''); setStatusFilter(null); setSelectedTags([])
  }, [])

  const toggleTag = (t) => setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  // Every section's calendar opens a job the same way. The hash flip is
  // load-bearing, not cosmetic: JobView only renders inside the `section ===
  // 'jobs'` block, so opening a job from the Dashboard or Finance without it
  // would set the state and show nothing at all.
  const openJobFromAnywhere = useCallback((job) => {
    setActiveJob(job)
    if (sectionFromHash() !== 'jobs') window.location.hash = '#/jobs'
  }, [])

  const openJob = useMemo(
    () => (activeJob ? jobs.find((j) => j.id === activeJob.id) || activeJob : null),
    [activeJob, jobs],
  )

  const anyOverlay = addOpen || templatesOpen || deleteAllOpen || deleteSelectedOpen || costingOpen || assignOpen || !!importReview || !!openJob

  // Global shortcuts: "/" or ⌘/Ctrl-K focuses search; Escape clears filters and
  // selection. Skipped while typing in a field or when an overlay owns Escape.
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        if (anyOverlay) return
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === 'Escape' && !anyOverlay) {
        if (typing && el === searchRef.current) { setQuery(''); el.blur(); return }
        if (!typing && (hasFilters || selected.size > 0)) { clearFilters(); setSelected(new Set()); setAnchorId(null) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyOverlay, hasFilters, selected.size, clearFilters])

  // Booked / Done / Paid / Cancelled apply straight away. The old pipeline
  // made you confirm a documents checklist before advancing a stage — that
  // belonged to a paperwork workflow this app no longer models.
  const requestStatusChange = useCallback((job, newStatus) => {
    if (!job || newStatus === job.status) return
    updateJob(job.id, { status: newStatus })
  }, [updateJob])

  const archiveJob = useCallback((job) => {
    const nowArchived = !job.archived
    updateJob(job.id, { archived: nowArchived })
    setActiveJob(null)
    pushToast({
      type: 'success',
      text: nowArchived ? 'Job archived.' : 'Job restored to active.',
      action: { label: 'Undo', onClick: () => updateJob(job.id, { archived: !nowArchived }) },
    })
  }, [updateJob, pushToast])

  // ---- Multi-select (Jobs list) ----
  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setAnchorId(id)
  }, [])

  // Shift-click: select every job between the anchor and this one, in view order.
  const selectRange = useCallback((id) => {
    const ids = sorted.map((j) => j.id)
    const anchor = anchorId ?? id
    const i1 = ids.indexOf(anchor)
    const i2 = ids.indexOf(id)
    setSelected((prev) => {
      const next = new Set(prev)
      if (i1 === -1 || i2 === -1) { next.add(id); return next }
      const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1]
      for (let k = lo; k <= hi; k++) next.add(ids[k])
      return next
    })
    // Re-seed a missing anchor (it was filtered away, or a marquee/select-all
    // left none) — otherwise every later shift-click silently selected one job
    // instead of a range, for the rest of the session.
    if (i1 === -1) setAnchorId(id)
  }, [sorted, anchorId])

  // Drag-box: replace (or, with a modifier, add to) the selection.
  const applyMarquee = useCallback((ids, additive) => {
    setSelected((prev) => {
      if (additive) { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next }
      return new Set(ids)
    })
    // A shift-click straight after a drag should range from the drag, not
    // from whatever was clicked before it.
    if (ids.length) setAnchorId(ids[ids.length - 1])
  }, [])

  const clearSelection = useCallback(() => { setSelected(new Set()); setAnchorId(null) }, [])

  // Select (or clear) every job in a project at once.
  const toggleGroup = useCallback((ids) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }, [])

  const allVisibleSelected = sorted.length > 0 && sorted.every((j) => selected.has(j.id))
  const someVisibleSelected = selected.size > 0 && !allVisibleSelected
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (sorted.every((j) => next.has(j.id))) sorted.forEach((j) => next.delete(j.id))
      else sorted.forEach((j) => next.add(j.id))
      return next
    })
    setAnchorId(null)
  }

  const bulkSetStatus = useCallback(async (status) => {
    const ids = [...selected]
    // No confirm here: the single-job path applies a status straight away
    // (the old pipeline's documents gate is gone), and a bulk warning about
    // "advancing without the documents check" was guarding a step that no
    // longer exists — it just blocked the change behind a confusing dialog.
    const results = await Promise.all(ids.map((id) => updateJob(id, { status })))
    const failed = results.filter((ok) => ok === false).length
    const moved = ids.length - failed
    if (failed) {
      pushToast({ type: 'error', text: `Moved ${moved} of ${ids.length} — ${failed} job${failed === 1 ? '' : 's'} failed to save.` })
    } else {
      pushToast({ type: 'success', text: `Moved ${moved} job${moved === 1 ? '' : 's'} to ${statusLabel(status)}.` })
    }
  }, [selected, jobs, updateJob, pushToast])

  const bulkAddTag = useCallback(async (tag) => {
    const t = tag.trim()
    if (!t) return
    const writes = []
    for (const id of selected) {
      const job = jobs.find((j) => j.id === id)
      if (!job) continue
      const tags = job.tags || []
      if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) writes.push(updateJob(id, { tags: [...tags, t] }))
    }
    // Count the writes actually queued — jobs that already carry the tag are
    // skipped, and claiming to have tagged them would be a lie.
    const n = writes.length
    if (!n) {
      pushToast({ type: 'success', text: `Every selected job already has “${t}”.` })
      return
    }
    const results = await Promise.all(writes)
    const failed = results.filter((ok) => ok === false).length
    if (failed) pushToast({ type: 'error', text: `Tagged ${n - failed} of ${n} — ${failed} failed to save.` })
    else pushToast({ type: 'success', text: `Tagged ${n} job${n === 1 ? '' : 's'} “${t}”.` })
  }, [selected, jobs, updateJob, pushToast])

  // On the Archived tab this restores instead — archiving already-archived
  // jobs did nothing while reporting success, and its Undo then un-archived
  // them, i.e. undoing a change that never happened.
  const bulkArchive = useCallback(async () => {
    const ids = [...selected]
    const nowArchived = scope !== 'archived'
    const results = await Promise.all(ids.map((id) => updateJob(id, { archived: nowArchived })))
    const failed = results.filter((ok) => ok === false).length
    setSelected(new Set())
    const verb = nowArchived ? 'Archived' : 'Restored'
    if (failed) {
      pushToast({ type: 'error', text: `${verb} ${ids.length - failed} of ${ids.length} — ${failed} failed to save.` })
    } else {
      pushToast({
        type: 'success',
        text: `${verb} ${ids.length} job${ids.length === 1 ? '' : 's'}.`,
        action: { label: 'Undo', onClick: () => ids.forEach((id) => updateJob(id, { archived: !nowArchived })) },
      })
    }
  }, [selected, scope, updateJob, pushToast])

  // Costs/revenue applied across the selection. Whatever lands on the jobs
  // here is what the Finance tab reads, so this is also how a batch's money
  // gets into the books.
  const bulkSetCosting = useCallback(async (perJob) => {
    const results = await Promise.all(perJob.map(({ id, costing }) => updateJob(id, { costing })))
    const failed = results.filter((ok) => ok === false).length
    setCostingOpen(false)
    if (failed) {
      pushToast({ type: 'error', text: `Costed ${perJob.length - failed} of ${perJob.length} — ${failed} failed to save.` })
    } else {
      pushToast({ type: 'success', text: `Costs applied to ${perJob.length} job${perJob.length === 1 ? '' : 's'} — Finance updated.` })
    }
  }, [updateJob, pushToast])

  // Merge the chosen roles onto each selected job, leaving roles that weren't
  // filled in exactly as they were.
  const bulkAssign = useCallback(async (assignments) => {
    const ids = [...selected]
    const results = await Promise.all(
      ids.map((id) => {
        const job = jobs.find((j) => j.id === id)
        return updateJob(id, { assignments: { ...(job?.assignments || {}), ...assignments } })
      }),
    )
    const failed = results.filter((ok) => ok === false).length
    setAssignOpen(false)
    if (failed) {
      pushToast({ type: 'error', text: `Assigned ${ids.length - failed} of ${ids.length} — ${failed} failed to save.` })
    } else {
      pushToast({ type: 'success', text: `Assigned ${ids.length} job${ids.length === 1 ? '' : 's'}.` })
    }
  }, [selected, jobs, updateJob, pushToast])

  const bulkDelete = useCallback(async () => {
    const ids = [...selected]
    if (!ids.length) return
    try {
      await deleteJobs(ids)
      setSelected(new Set())
      setAnchorId(null)
      pushToast({ type: 'success', text: `Deleted ${ids.length} job${ids.length === 1 ? '' : 's'}.` })
    } catch (err) {
      pushToast({ type: 'error', text: err?.message || 'Could not delete those jobs.' })
    }
    setDeleteSelectedOpen(false)
  }, [selected, deleteJobs, pushToast])

  // Selection only applies to the Jobs list; drop it when the view or scope changes.
  useEffect(() => { setSelected(new Set()); setAnchorId(null) }, [view, scope])

  // Keep the selection honest: it may only ever contain jobs that are on
  // screen right now. Without this, filtering/searching (or a job being
  // deleted, archived, or removed by another user) left ids behind, so the
  // bulk bar counted jobs the user couldn't see — and acted on them.
  useEffect(() => {
    const visible = new Set(sorted.map((j) => j.id))
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
    setAnchorId((prev) => (prev && visible.has(prev) ? prev : null))
  }, [sorted])

  async function handleDeleteAll() {
    try {
      await clearAll()
    } catch (err) {
      setDeleteAllOpen(false)
      pushToast({ type: 'error', text: `Couldn't delete: ${err.message || err}` })
      return
    }
    setActiveJob(null)
    setStatusFilter(null)
    setSelected(new Set()) // else the bulk bar floats over the empty state
    setAnchorId(null)
    setDeleteAllOpen(false)
    pushToast({ type: 'success', text: 'All jobs and documents deleted.' })
  }

  const showEmptyHero = !loading && jobs.length === 0

  return (
    <div className="flex min-h-full flex-col bg-paper font-sans text-ink">
      {/* print:hidden so an invoice prints as just the sheet. This used to be a
          `.topbar` rule in business.css; the class went when the header moved
          onto utilities, and the rule silently stopped matching anything. */}
      <header ref={topbarRef} className="sticky top-0 z-20 border-b border-white/10 bg-navy text-white print:hidden">
        {/* The top inset is only non-zero on an iPhone added to the home
            screen, where the status bar sits over the page. Underscores are
            the separator Tailwind turns back into spaces — calc needs them
            around the +, and without them this whole class emits nothing. */}
        <div className="container-site flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 py-2 pt-[calc(0.5rem_+_env(safe-area-inset-top))] sm:min-h-16">
          <a className="font-display text-[17px] font-bold tracking-tight text-white no-underline sm:text-xl" href="#/">
            {/* Fixed moss accent: the header is always navy, so it must not
                move with the page's own colours. */}
            Eco Futures <span className="text-moss-soft">Assessment Manager</span>
          </a>

          {/* Third row on a phone, and it scrolls sideways on its own rather
              than pushing the page into a horizontal scroll. */}
          <nav
            aria-label="Sections"
            className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto px-1 [scrollbar-width:none] sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((t) => (
              <a
                key={t.key}
                href={t.href}
                aria-current={section === t.key ? 'page' : undefined}
                className={cx(navLink, section === t.key ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')}
              >
                {t.label}
              </a>
            ))}
          </nav>

          {/* One scrolling row on a phone rather than a wrapping block: the
              actions stacked two deep and the header ate a quarter of the
              screen. justify-start until sm, because a flex row that is both
              overflowing and end-justified cannot be scrolled back to its
              first item. */}
          <div className="order-2 -mx-1 flex w-full items-center gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&>*]:shrink-0 sm:order-none sm:mx-0 sm:ml-auto sm:w-auto sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {section === 'jobs' && (
              <span
                title={storeMode === 'supabase' ? 'Live multi-user sync' : 'Stored locally in this browser'}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 text-xs font-medium text-white/80"
              >
                <span className={cx('h-1.5 w-1.5 rounded-full', storeMode === 'supabase' ? 'bg-moss-soft' : 'bg-amber')} aria-hidden />
                {storeMode === 'supabase' ? 'Live sync' : 'Local'}
              </span>
            )}
            {configured && (
              <Button as="a" tone="ghost" onDark href={`${HUB_URL}/retrofit-suite`} title="Back to the Retrofit Suite">
                <LayoutGrid size={15} /> Suite
              </Button>
            )}
            {isAdmin && (
              <Button as="a" tone="ghost" onDark href={`${HUB_URL}/retrofit-suite/team`}>
                Manage team
              </Button>
            )}
            {section === 'jobs' && (
              <>
                <Button tone="ghost" onDark onClick={() => setTemplatesOpen(true)}>Templates</Button>
                <CsvUpload variant="compact" onJobs={addJobs} onToast={pushToast} onReview={setImportReview} />
                <Button tone="primary" onClick={() => setAddOpen(true)}>
                  <Plus size={16} /> Add job
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {section === 'dashboard' && (
        <DashboardSection
          jobs={jobs}
          addJobs={addJobs}
          onOpenJob={openJobFromAnywhere}
          onToast={pushToast}
        />
      )}
      {/* Finance shows the same calendar as everywhere else, so it needs the
          real jobs list — not just the rows it derives from their costing. */}
      {section === 'finance' && <BusinessSection jobs={jobs} onOpenJob={openJobFromAnywhere} />}
      {section === 'my-expenses' && <WorkerExpensesRoute />}

      {section === 'jobs' && (
      <>
      {/* container-site is the Dashboard's and Finance's own gutter, so all
          three sections now line up at every width. The bottom padding clears
          the floating bulk-actions bar, whose height BulkActionsBar publishes
          as --bulk-bar-h: it is 268px tall on a phone (eight controls, three
          rows) against the 96px that was reserved, so the last two job cards
          sat behind it with no scroll position that could reveal them. */}
      <main className="container-site flex flex-col gap-5 py-5 pb-[calc(2rem+env(safe-area-inset-bottom)+var(--bulk-bar-h,0px))]">
        {error && <Banner tone="danger">Something went wrong: {error}</Banner>}

        {/* Also while LOADING, not only once jobs have arrived: the bar is 66px
            tall, so gating it on the async read returning shoved the whole
            board down the moment the jobs appeared. Reserving the row up front
            is why the board no longer jumps under your thumb on a phone. */}
        {(loading || jobs.length > 0) && (
          <StatusBar jobs={activeJobs} activeStatus={statusFilter} onSelect={setStatusFilter} />
        )}

        {showEmptyHero ? (
          <EmptyState
            size="hero"
            icon={<SpecLabel>Get started</SpecLabel>}
            title="Start tracking assessments"
            action={
              <>
                <Button tone="primary" onClick={() => setAddOpen(true)}>
                  <Plus size={16} /> Add a property
                </Button>
                <CsvUpload variant="dropzone" onJobs={addJobs} onToast={pushToast} onReview={setImportReview} />
              </>
            }
          >
            Add a property by hand, or import a spreadsheet (CSV or Excel) to load a whole
            batch. Each assessment is booked, then done, then paid — with its own notes,
            documents and costs along the way.
          </EmptyState>
        ) : (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                label="View"
                options={VIEWS}
                value={view}
                onChange={setView}
                full
                className="sm:w-auto"
              />

              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <Mono className="text-sm text-ink">
                  {sorted.length}<span className="text-ink-mute"> / {scope === 'archived' ? archivedCount : activeJobs.length}</span>
                </Mono>
                {(archivedCount > 0 || scope === 'archived') && (
                  <Button
                    size="sm"
                    tone={scope === 'archived' ? 'primary' : 'ghost'}
                    onClick={() => setScope(scope === 'archived' ? 'active' : 'archived')}
                  >
                    {scope === 'archived' ? 'Active jobs' : `Archived${archivedCount ? ` (${archivedCount})` : ''}`}
                  </Button>
                )}
                {mayDelete && (
                  <Button size="sm" tone="ghost" onClick={() => setDeleteAllOpen(true)} title="Delete all jobs">
                    <Trash2 size={15} className="text-danger" /> Delete all
                  </Button>
                )}
              </div>
            </div>

            {view !== 'calendar' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1 basis-64">
                  <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                  <Input
                    ref={searchRef}
                    type="search"
                    className="pl-9 pr-12"
                    placeholder="Search address, postcode, reference…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search jobs"
                    aria-keyshortcuts="/"
                  />
                  {/* Hidden on a phone: there is no key to press. */}
                  {!query && (
                    <kbd
                      title="Press / to search"
                      className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line-strong bg-sunken px-1.5 font-mono text-[10px] text-ink-mute sm:block"
                    >/</kbd>
                  )}
                </div>
                <Select
                  className="w-full sm:w-52"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort jobs"
                  title="Sort jobs"
                >
                  {SORTS.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
                </Select>
                {/* Shown while LOADING too, disabled. It wraps onto a row of
                    its own at 375px, so appearing only once the jobs arrived
                    shunted the whole board down by that row's height. */}
                {view === 'list' && (loading || sorted.length > 0) && (
                  <label
                    title="Select all shown"
                    className={cx(
                      'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-paper-card px-3 text-sm text-ink-faint',
                      loading ? 'opacity-60' : 'cursor-pointer hover:text-ink',
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={loading}
                      className="h-4 w-4 cursor-pointer accent-ember"
                      checked={allVisibleSelected}
                      // A part-selection shows a dash rather than an empty box,
                      // matching the project header checkboxes.
                      ref={(el) => { if (el) el.indeterminate = someVisibleSelected }}
                      onChange={toggleSelectAll}
                    />
                    All
                  </label>
                )}
              </div>
            )}

            {(statusFilter || allTags.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {statusFilter && (
                  <FilterChip active onClick={() => setStatusFilter(null)} title="Clear the status filter">
                    Status: {statusLabel(statusFilter)} ✕
                  </FilterChip>
                )}
                {allTags.length > 0 && (
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <SpecLabel as="span" tone="faint">Tags</SpecLabel>
                    {allTags.map((t) => (
                      <FilterChip key={t} active={selectedTags.includes(t)} onClick={() => toggleTag(t)}>
                        {t}
                      </FilterChip>
                    ))}
                    {selectedTags.length > 0 && (
                      <Button size="sm" tone="ghost" onClick={() => setSelectedTags([])}>Clear tags</Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {loading ? (
              // Exactly JobList's track. A bare minmax(300px,1fr) has a 300px
              // floor, so at 320px the skeleton was 20px wider than the cards
              // that replaced it and the board visibly snapped narrower.
              <div className="grid content-start gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[118px] animate-pulse rounded-xl bg-sunken" />
                ))}
              </div>
            ) : view === 'list' ? (
              <JobList
                jobs={sorted}
                hasFilters={hasFilters}
                onClearFilters={clearFilters}
                onStatusChange={requestStatusChange}
                onOpen={setActiveJob}
                selectedIds={selected}
                onToggleSelect={toggleSelect}
                onSelectRange={selectRange}
                onApplyMarquee={applyMarquee}
                onClearSelection={clearSelection}
              />
            ) : view === 'projects' ? (
              <ProjectsView
                jobs={sorted}
                hasFilters={hasFilters}
                onClearFilters={clearFilters}
                onOpen={setActiveJob}
                selectedIds={selected}
                onToggleSelect={toggleSelect}
                onToggleGroup={toggleGroup}
              />
            ) : (
              // `sorted`, not `jobs`: the status/tag/search filters apply to
              // the calendar exactly as they did before. filterNote makes that
              // visible, so a filtered month never reads as a missing one.
              <Calendar
                jobs={sorted}
                views={['month', 'timeline']}
                onOpenJob={setActiveJob}
                filterNote={hasFilters ? 'Filtered view' : null}
                renderDayActions={(iso) => (
                  <Button tone="primary" onClick={() => { setAddDate(iso); setAddOpen(true) }}>
                    <Plus size={16} /> Add a job
                  </Button>
                )}
              />
            )}
          </section>
        )}
      </main>

      {openJob && (
        <JobView
          job={openJob}
          onClose={() => setActiveJob(null)}
          onUpdate={updateJob}
          onStatusChange={requestStatusChange}
          onArchive={archiveJob}
          onManageTemplates={() => setTemplatesOpen(true)}
        />
      )}

      {addOpen && (
        <AddJobModal
          initialDate={addDate}
          onClose={() => { setAddOpen(false); setAddDate('') }}
          onCreate={async (job) => {
            const created = await addJobs([job])
            if (created && created[0]) setActiveJob(created[0])
          }}
        />
      )}

      {deleteAllOpen && (
        <DeleteAllDialog
          count={jobs.length}
          onCancel={() => setDeleteAllOpen(false)}
          onConfirm={handleDeleteAll}
        />
      )}

      {(view === 'list' || view === 'projects') && selected.size > 0 && (
        <BulkActionsBar
          count={selected.size}
          archived={scope === 'archived'}
          onSetStatus={bulkSetStatus}
          onAddTag={bulkAddTag}
          onArchive={bulkArchive}
          onDelete={mayDelete ? () => setDeleteSelectedOpen(true) : null}
          onCosts={() => setCostingOpen(true)}
          onAssign={() => setAssignOpen(true)}
          onClear={clearSelection}
        />
      )}

      {assignOpen && (
        <BulkAssignDialog
          count={selected.size}
          onCancel={() => setAssignOpen(false)}
          onApply={bulkAssign}
        />
      )}

      {costingOpen && (
        <BulkCostingDialog
          jobs={jobs.filter((j) => selected.has(j.id))}
          onCancel={() => setCostingOpen(false)}
          onApply={bulkSetCosting}
        />
      )}

      {deleteSelectedOpen && (
        <DeleteSelectedDialog
          count={selected.size}
          onCancel={() => setDeleteSelectedOpen(false)}
          onConfirm={bulkDelete}
        />
      )}

      {importReview && (
        <ImportReview
          parsed={importReview}
          existingJobs={jobs}
          onCancel={() => setImportReview(null)}
          onApply={async ({ created, updates, overwrite }) => {
            if (created.length) await addJobs(created)
            const results = await Promise.all(
              updates.map((u) => updateJob(u.job.id, patchFor(u, overwrite))),
            )
            const failed = results.filter((ok) => ok === false).length
            setImportReview(null)
            const parts = []
            if (created.length) parts.push(`added ${created.length}`)
            if (updates.length) parts.push(`${overwrite ? 'updated' : 'topped up'} ${updates.length - failed}`)
            pushToast({
              type: failed ? 'error' : 'success',
              text: failed
                ? `Imported, but ${failed} update${failed === 1 ? '' : 's'} failed to save.`
                : `Import done — ${parts.join(' and ')}.`,
            })
          }}
        />
      )}

      {templatesOpen && <TemplatesPage onClose={() => setTemplatesOpen(false)} />}
      </>
      )}

      {toast && (
        <Toast
          tone={toast.type}
          action={toast.action && {
            label: toast.action.label,
            onClick: () => { toast.action.onClick(); setToast(null) },
          }}
        >
          {toast.text}
        </Toast>
      )}
    </div>
  )
}

// '#/my-expenses' — worker expense logging. Only meaningful for signed-in
// levels 1–2 with the per-account permission; everyone else who lands here
// gets pointed at the right place instead.
function WorkerExpensesRoute() {
  const { configured, isAdmin, canSubmitExpenses } = useAuth()
  if (configured && !isAdmin && canSubmitExpenses) return <MyExpenses />
  return (
    <div className="container-site py-16 text-center">
      <h1 className="font-display text-2xl font-bold">
        {isAdmin ? 'Expenses live in your Finance tab' : 'Expense logging isn’t enabled'}
      </h1>
      <p className="mx-auto mt-2 mb-5 max-w-md text-sm text-ink-faint">
        {isAdmin
          ? 'As an admin you manage expenses (yours and the team’s) from Finance.'
          : configured
            ? 'Ask your admin to switch on expense logging for your account.'
            : 'Expense logging is part of the suite login — your jobs are all on the Jobs tab.'}
      </p>
      <Button as="a" tone="primary" href={isAdmin ? '#/finance/expenses' : '#/jobs'}>
        {isAdmin ? 'Open Finance expenses' : 'Back to your jobs'}
      </Button>
    </div>
  )
}

// The red circle both delete dialogs lead with. Big enough to register as a
// stop sign before the words are read.
function DangerMark() {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-wash text-danger" aria-hidden>
      <AlertTriangle size={22} />
    </span>
  )
}

// Confirmation for deleting the selected jobs. Deleting is irreversible (and
// takes the jobs' documents with it), so it always asks — but a plain confirm,
// not the typed one the "delete everything" button uses.
function DeleteSelectedDialog({ count, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      size="sm"
      title={`Delete ${count} selected job${count === 1 ? '' : 's'}?`}
      // No way out while the delete is in flight — closing here would leave
      // the user unsure whether it happened.
      onClose={busy ? undefined : onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            tone="danger"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}
          >
            {busy ? 'Deleting…' : `Delete ${count} job${count === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <DangerMark />
        <p className="text-sm leading-relaxed text-ink-faint">
          This permanently removes {count === 1 ? 'the job and its documents' : 'these jobs and their documents'}.
          It cannot be undone — to keep {count === 1 ? 'it' : 'them'} out of the way instead, use <strong className="font-semibold text-ink">Archive</strong>.
        </p>
      </div>
    </Modal>
  )
}

// Two-step, typed confirmation for the irreversible "delete everything" action.
// The user must type the exact job count, so it can't be triggered by a stray click.
function DeleteAllDialog({ count, onCancel, onConfirm }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = text.trim() === String(count)

  return (
    <Modal
      size="sm"
      title={`Delete all ${count} job${count === 1 ? '' : 's'}?`}
      onClose={busy ? undefined : onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            tone="danger"
            disabled={!ok || busy}
            onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}
          >
            {busy ? 'Deleting…' : `Delete ${count} job${count === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <DangerMark />
        <p className="text-sm leading-relaxed text-ink-faint">
          This permanently removes <strong className="font-semibold text-ink">every job and its uploaded documents</strong> from
          this browser. It cannot be undone.
        </p>
      </div>
      <Field className="mt-4" label={<>Type {count} to confirm</>}>
        <Input
          autoFocus
          mono
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={String(count)}
          inputMode="numeric"
        />
      </Field>
    </Modal>
  )
}
