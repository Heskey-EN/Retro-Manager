import { useRef, useState, useCallback } from 'react'
import JobCard from './JobCard'

// Presentational grid of job cards with two selection gestures:
//   - shift / ⌘-click on a card (handled in JobCard) for range / toggle
//   - drag a box (marquee) from anywhere on the grid to select cards it touches.
//     A small movement threshold tells a drag apart from a click, so you can
//     start the drag on top of a card and a plain click still opens it.
export default function JobList({
  jobs, onStatusChange, onOpen,
  selectedIds, onToggleSelect, onSelectRange, onApplyMarquee, onClearSelection,
  hasFilters, onClearFilters,
}) {
  const gridRef = useRef(null)
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const [rect, setRect] = useState(null)
  const [dragging, setDragging] = useState(false)

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 || !onApplyMarquee) return
    // Never start a marquee from an interactive control (status pill, checkbox…).
    if (e.target.closest('.status-pill, .card__check, button, select, input, textarea, a, label')) return

    const box = gridRef.current.getBoundingClientRect()
    drag.current = {
      x0: e.clientX, y0: e.clientY,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      onCard: !!e.target.closest('.card'),
      moved: false, box,
    }

    const move = (ev) => {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return
      if (!d.moved) { d.moved = true; setDragging(true) }
      const left = Math.min(d.x0, ev.clientX)
      const right = Math.max(d.x0, ev.clientX)
      const top = Math.min(d.y0, ev.clientY)
      const bottom = Math.max(d.y0, ev.clientY)
      setRect({ left: left - d.box.left, top: top - d.box.top, width: right - left, height: bottom - top })
      const ids = []
      gridRef.current.querySelectorAll('.card').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) ids.push(el.dataset.jobId)
      })
      onApplyMarquee(ids, d.additive)
    }

    const up = () => {
      const d = drag.current
      if (d?.moved) {
        // A drag just happened — swallow the click that the browser fires next
        // so the card underneath doesn't open.
        suppressClick.current = true
        setTimeout(() => { suppressClick.current = false }, 0)
      } else if (d && !d.additive && !d.onCard) {
        onClearSelection?.() // plain click on empty space clears the selection
      }
      drag.current = null
      setRect(null)
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [onApplyMarquee, onClearSelection])

  const onClickCapture = useCallback((e) => {
    if (suppressClick.current) {
      suppressClick.current = false
      e.stopPropagation()
      e.preventDefault()
    }
  }, [])

  if (!jobs.length) {
    return (
      <div className="placeholder">
        {hasFilters ? (
          <>
            <p>No jobs match your search or filters.</p>
            <button type="button" className="btn btn--sm placeholder__action" onClick={onClearFilters}>
              Clear filters
            </button>
          </>
        ) : (
          <p>No jobs yet.</p>
        )}
      </div>
    )
  }

  const selecting = selectedIds && selectedIds.size > 0

  return (
    <div
      ref={gridRef}
      className={`grid${selecting ? ' grid--selecting' : ''}${dragging ? ' is-dragging' : ''}`}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          onStatusChange={onStatusChange}
          onOpen={onOpen}
          selected={selectedIds ? selectedIds.has(job.id) : false}
          onToggleSelect={onToggleSelect}
          onSelectRange={onSelectRange}
        />
      ))}
      {rect && (
        <div className="marquee" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
      )}
    </div>
  )
}
