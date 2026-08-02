import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useJobs } from './hooks/useJobs'
import { useAuth } from './hooks/useAuth'
import { storeMode } from './lib/jobsStore'
import { HUB_URL } from './lib/supabaseClient'
import { statusIndex, statusLabel, isTerminalStatus } from './lib/status'
import { jobReference, jobPostcode, jobCustomer, jobMeasure, jobAddress } from './lib/display'
import Icon from './components/Icon'
import Pipeline from './components/Pipeline'
import CsvUpload from './components/CsvUpload'
import JobList from './components/JobList'
import ProjectsView from './components/ProjectsView'
import CalendarTimeline from './components/CalendarTimeline'
import JobView from './components/JobView'
import AddJobModal from './components/AddJobModal'
import StageMoveDialog from './components/StageMoveDialog'
import BulkActionsBar from './components/BulkActionsBar'
import BulkCostingDialog from './components/BulkCostingDialog'
import BulkAssignDialog from './components/BulkAssignDialog'
import DashboardSection from './dashboard/DashboardSection'
import ImportReview from './components/ImportReview'
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
  { value: 'stage', label: 'Pipeline stage' },
  { value: 'address', label: 'Address A–Z' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'added', label: 'Recently added' },
]

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
  const [stageMove, setStageMove] = useState(null)
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

  const pushToast = useCallback((t) => {
    setToast(t)
    window.clearTimeout(pushToast._t)
    pushToast._t = window.setTimeout(() => setToast(null), t?.action ? 7000 : 4500)
  }, [])

  useEffect(() => { localStorage.setItem('retrofit.sort', sortBy) }, [sortBy])

  // Follow hash changes between the top-level sections.
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Finance is level 3–4 territory in suite mode (FinanceGate + RLS enforce
  // it); in local mode the tab shows and the per-device passcode protects it.
  const showFinanceTab = !configured || isAdmin
  const showMyExpensesTab = configured && !isAdmin && canSubmitExpenses

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
      if (statusFilter && job.status !== statusFilter) return false
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

  const openJob = useMemo(
    () => (activeJob ? jobs.find((j) => j.id === activeJob.id) || activeJob : null),
    [activeJob, jobs],
  )

  const anyOverlay = addOpen || templatesOpen || deleteAllOpen || deleteSelectedOpen || costingOpen || assignOpen || !!importReview || !!stageMove || !!openJob

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

  // Advancing a job to a later stage requires confirming documents are in place.
  // Moving backward (or to the same stage) applies immediately.
  const requestStatusChange = useCallback((job, newStatus) => {
    if (!job || newStatus === job.status) return
    // Cancelling is never "advancing", so it skips the documents check.
    if (!isTerminalStatus(newStatus) && statusIndex(newStatus) > statusIndex(job.status)) {
      setStageMove({ job, toStatus: newStatus })
    } else {
      updateJob(job.id, { status: newStatus })
    }
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
    // Bulk moves skip the per-job documents gate, so warn when any job would
    // jump *forward* in the pipeline (the case the single-job gate protects).
    const advancing = ids
      .map((id) => jobs.find((j) => j.id === id))
      .filter((j) => j && statusIndex(status) > statusIndex(j.status)).length
    if (advancing > 0) {
      const ok = window.confirm(
        `${advancing} of ${ids.length} selected job${ids.length === 1 ? '' : 's'} will advance to “${statusLabel(status)}” without the per-stage documents check. Continue?`,
      )
      if (!ok) return
    }
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
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
        <a className="topbar__title" href="#/">
          Eco Futures <span className="accent">RetroManager</span>
        </a>
        <nav className="topbar__nav" aria-label="Sections">
          <a className={`topbar__navlink${section === 'dashboard' ? ' is-active' : ''}`} href="#/">Dashboard</a>
          <a className={`topbar__navlink${section === 'jobs' ? ' is-active' : ''}`} href="#/jobs">Jobs</a>
          {showFinanceTab && (
            <a className={`topbar__navlink${section === 'finance' ? ' is-active' : ''}`} href="#/finance">Finance</a>
          )}
          {showMyExpensesTab && (
            <a className={`topbar__navlink${section === 'my-expenses' ? ' is-active' : ''}`} href="#/my-expenses">Expenses</a>
          )}
        </nav>
        <div className="topbar__actions">
          {section === 'jobs' && (
            <span className={`mode-chip mode-chip--${storeMode}`} title={storeMode === 'supabase' ? 'Live multi-user sync' : 'Stored locally in this browser'}>
              <span className="mode-chip__dot" />
              {storeMode === 'supabase' ? 'Live sync' : 'Local'}
            </span>
          )}
          {configured && (
            <a className="btn btn--ghost" href={`${HUB_URL}/retrofit-suite`} title="Back to the Retrofit Suite">
              <Icon name="grid" size={15} /> Suite
            </a>
          )}
          {isAdmin && (
            <a className="btn btn--ghost" href={`${HUB_URL}/retrofit-suite/team`}>
              Manage team
            </a>
          )}
          {section === 'jobs' && (
            <>
              <button className="btn" onClick={() => setTemplatesOpen(true)}>Templates</button>
              <CsvUpload variant="compact" onJobs={addJobs} onToast={pushToast} onReview={setImportReview} />
              <button className="btn btn--primary" onClick={() => setAddOpen(true)}>
                <Icon name="plus" /> Add job
              </button>
            </>
          )}
        </div>
        </div>
      </header>

      {section === 'dashboard' && (
        <DashboardSection
          jobs={jobs}
          addJobs={addJobs}
          onOpenJob={(job) => { setActiveJob(job); window.location.hash = '#/jobs' }}
          onToast={pushToast}
        />
      )}
      {section === 'finance' && <BusinessSection />}
      {section === 'my-expenses' && <WorkerExpensesRoute />}

      {section === 'jobs' && (
      <>
      {error && <div className="alert" role="alert">Something went wrong: {error}</div>}

      <main className="shell">
        {jobs.length > 0 && (
          <Pipeline jobs={activeJobs} activeStatus={statusFilter} onSelect={setStatusFilter} />
        )}

        {showEmptyHero ? (
          <section className="empty-hero">
            <div className="empty-hero__inner">
              <p className="eyebrow">Get started</p>
              <h1 className="empty-hero__title">Start tracking retrofit jobs</h1>
              <p className="empty-hero__lead">
                Add a property by hand, or import a spreadsheet (CSV or Excel) to load a whole
                batch. Each job moves through booking, assessment, coordination, compiling
                documents and submission — with its own notes and files along the way.
              </p>
              <div className="empty-hero__actions">
                <button className="btn btn--primary btn--lg" onClick={() => setAddOpen(true)}>
                  <Icon name="plus" /> Add a property
                </button>
                <CsvUpload variant="dropzone" onJobs={addJobs} onToast={pushToast} onReview={setImportReview} />
              </div>
            </div>
          </section>
        ) : (
          <section className="board">
            <div className="board__toolbar">
              <div className="segmented" role="tablist" aria-label="View">
                <button
                  role="tab" aria-selected={view === 'list'}
                  className={`segmented__btn${view === 'list' ? ' is-active' : ''}`}
                  onClick={() => setView('list')}
                >Jobs</button>
                <button
                  role="tab" aria-selected={view === 'projects'}
                  className={`segmented__btn${view === 'projects' ? ' is-active' : ''}`}
                  onClick={() => setView('projects')}
                >Projects</button>
                <button
                  role="tab" aria-selected={view === 'calendar'}
                  className={`segmented__btn${view === 'calendar' ? ' is-active' : ''}`}
                  onClick={() => setView('calendar')}
                >Calendar</button>
              </div>

              <div className="board__right">
                {view === 'list' && sorted.length > 0 && (
                  <label className="selectall" title="Select all shown">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      // A part-selection shows a dash rather than an empty box,
                      // matching the project header checkboxes.
                      ref={(el) => { if (el) el.indeterminate = someVisibleSelected }}
                      onChange={toggleSelectAll}
                    />
                    All
                  </label>
                )}
                {view !== 'calendar' && (
                  <div className="search">
                    <span className="search__icon" aria-hidden><Icon name="search" size={15} /></span>
                    <input
                      ref={searchRef}
                      type="search"
                      placeholder="Search address, postcode, reference…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-keyshortcuts="/"
                    />
                    {!query && <kbd title="Press / to search">/</kbd>}
                  </div>
                )}
                {view !== 'calendar' && (
                  <select
                    className="sortselect"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    aria-label="Sort jobs"
                    title="Sort jobs"
                  >
                    {SORTS.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
                  </select>
                )}
                <span className="board__count">
                  {sorted.length}<span className="board__count-of"> / {scope === 'archived' ? archivedCount : activeJobs.length}</span>
                </span>
                {(archivedCount > 0 || scope === 'archived') && (
                  <button
                    className={`btn btn--sm${scope === 'archived' ? ' btn--primary' : ' btn--ghost'}`}
                    onClick={() => setScope(scope === 'archived' ? 'active' : 'archived')}
                  >
                    {scope === 'archived' ? 'Active jobs' : `Archived${archivedCount ? ` (${archivedCount})` : ''}`}
                  </button>
                )}
                {mayDelete && (
                  <button className="btn btn--ghost btn--sm iconbtn--danger" onClick={() => setDeleteAllOpen(true)} title="Delete all jobs">
                    <Icon name="trash" size={15} /> Delete all
                  </button>
                )}
              </div>
            </div>

            {(statusFilter || allTags.length > 0) && (
              <div className="filters">
                {statusFilter && (
                  <span className="filter-note">
                    Stage: <strong>{statusLabel(statusFilter)}</strong>
                    <button className="filter-note__clear" onClick={() => setStatusFilter(null)}>clear</button>
                  </span>
                )}
                {allTags.length > 0 && (
                  <div className="filters__tags">
                    <span className="filters__label">Tags</span>
                    {allTags.map((t) => (
                      <button
                        key={t}
                        className={`tag tag--toggle${selectedTags.includes(t) ? ' is-on' : ''}`}
                        onClick={() => toggleTag(t)}
                      >{t}</button>
                    ))}
                    {selectedTags.length > 0 && (
                      <button className="filter-note__clear" onClick={() => setSelectedTags([])}>clear</button>
                    )}
                  </div>
                )}
              </div>
            )}

            {loading ? (
              <div className="job-grid" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton skeleton-card" />)}
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
              <CalendarTimeline jobs={sorted} onOpen={setActiveJob} />
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
          onClose={() => setAddOpen(false)}
          onCreate={async (job) => {
            const created = await addJobs([job])
            if (created && created[0]) setActiveJob(created[0])
          }}
        />
      )}

      {stageMove && (
        <StageMoveDialog
          job={stageMove.job}
          toStatus={stageMove.toStatus}
          onCancel={() => setStageMove(null)}
          onConfirm={() => {
            updateJob(stageMove.job.id, { status: stageMove.toStatus })
            setStageMove(null)
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
          onApply={async ({ created, updates }) => {
            if (created.length) await addJobs(created)
            const results = await Promise.all(
              updates.map((u) => updateJob(u.job.id, u.patch)),
            )
            const failed = results.filter((ok) => ok === false).length
            setImportReview(null)
            const parts = []
            if (created.length) parts.push(`added ${created.length}`)
            if (updates.length) parts.push(`topped up ${updates.length - failed}`)
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
        <div className={`toast toast--${toast.type}`} role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button className="toast__action" onClick={() => { toast.action.onClick(); setToast(null) }}>
              {toast.action.label}
            </button>
          )}
        </div>
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
    <div className="biz font-sans text-ink">
      <div className="container-site py-16 text-center">
        <h1 className="mb-2 font-display text-2xl font-bold">
          {isAdmin ? 'Expenses live in your Finance tab' : 'Expense logging isn’t enabled'}
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          {isAdmin
            ? 'As an admin you manage expenses (yours and the team’s) from Finance.'
            : configured
              ? 'Ask your admin to switch on expense logging for your account.'
              : 'Expense logging is part of the suite login — your jobs are all on the Jobs tab.'}
        </p>
        <a className="btn-primary inline-flex rounded-lg" href={isAdmin ? '#/finance/expenses' : '#/jobs'}>
          {isAdmin ? 'Open Finance expenses' : 'Back to your jobs'}
        </a>
      </div>
    </div>
  )
}

// Confirmation for deleting the selected jobs. Deleting is irreversible (and
// takes the jobs' documents with it), so it always asks — but a plain confirm,
// not the typed one the "delete everything" button uses.
function DeleteSelectedDialog({ count, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal modal--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Delete selected jobs">
        <div className="confirm">
          <span className="confirm__icon"><Icon name="alert" size={22} /></span>
          <h2 className="confirm__title">Delete {count} selected job{count === 1 ? '' : 's'}?</h2>
          <p className="confirm__text">
            This permanently removes {count === 1 ? 'the job and its documents' : 'these jobs and their documents'}.
            It cannot be undone — to keep {count === 1 ? 'it' : 'them'} out of the way instead, use <strong>Archive</strong>.
          </p>
          <div className="confirm__actions">
            <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              className="btn btn--danger"
              disabled={busy}
              onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}
            >
              {busy ? 'Deleting…' : `Delete ${count} job${count === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Two-step, typed confirmation for the irreversible "delete everything" action.
// The user must type the exact job count, so it can't be triggered by a stray click.
function DeleteAllDialog({ count, onCancel, onConfirm }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = text.trim() === String(count)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal modal--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Delete all jobs">
        <div className="confirm">
          <span className="confirm__icon"><Icon name="alert" size={22} /></span>
          <h2 className="confirm__title">Delete all {count} job{count === 1 ? '' : 's'}?</h2>
          <p className="confirm__text">
            This permanently removes <strong>every job and its uploaded documents</strong> from this browser.
            It cannot be undone.
          </p>
          <label className="confirm__field">
            <span>Type <strong>{count}</strong> to confirm</span>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={String(count)}
              inputMode="numeric"
            />
          </label>
          <div className="confirm__actions">
            <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              className="btn btn--danger"
              disabled={!ok || busy}
              onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}
            >
              {busy ? 'Deleting…' : `Delete ${count} job${count === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
