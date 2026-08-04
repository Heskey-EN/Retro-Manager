import { useRef, useState, useCallback } from 'react'
import JobCard from './JobCard'
import { Button, EmptyState, cx } from '../ui'

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
    // Mouse only. On touch this same handler fought the scroller: a swipe to
    // scroll cleared the 6px threshold and selected every card it crossed,
    // and because iOS then fires pointercancel (never pointerup) the teardown
    // below never ran — leaving the listeners attached so subsequent scrolls
    // kept rewriting the selection.
    if (e.pointerType && e.pointerType !== 'mouse') return
    // Never start a marquee from an interactive control. data-no-marquee marks
    // the ones that are not themselves a form element (the status pill's
    // padding, the tick box's column) — a class name here would break again
    // the next time one of those is restyled.
    if (e.target.closest('button, select, input, textarea, a, label, [data-no-marquee]')) return
    if (drag.current) return // a previous gesture never finished — ignore

    const box = gridRef.current.getBoundingClientRect()
    drag.current = {
      x0: e.clientX, y0: e.clientY,
      pointerId: e.pointerId,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      onCard: !!e.target.closest('[data-job-id]'),
      moved: false, box,
    }

    const teardown = () => {
      drag.current = null
      setRect(null)
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }

    const move = (ev) => {
      const d = drag.current
      if (!d || ev.pointerId !== d.pointerId) return
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return
      if (!d.moved) { d.moved = true; setDragging(true) }
      const left = Math.min(d.x0, ev.clientX)
      const right = Math.max(d.x0, ev.clientX)
      const top = Math.min(d.y0, ev.clientY)
      const bottom = Math.max(d.y0, ev.clientY)
      setRect({ left: left - d.box.left, top: top - d.box.top, width: right - left, height: bottom - top })
      const ids = []
      gridRef.current.querySelectorAll('[data-job-id]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) ids.push(el.dataset.jobId)
      })
      onApplyMarquee(ids, d.additive)
    }

    const up = (ev) => {
      const d = drag.current
      if (d && ev.pointerId !== d.pointerId) return
      if (d?.moved) {
        // A drag just happened — swallow the click that the browser fires next
        // so the card underneath doesn't open.
        suppressClick.current = true
        setTimeout(() => { suppressClick.current = false }, 0)
      } else if (d && !d.additive && !d.onCard) {
        onClearSelection?.() // plain click on empty space clears the selection
      }
      teardown()
    }

    // The gesture was taken over (scroll, window blur, right-click): drop it
    // without applying the marquee, but always release the listeners.
    const cancel = (ev) => {
      const d = drag.current
      if (d && ev.pointerId !== d.pointerId) return
      teardown()
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
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
      <EmptyState action={hasFilters ? <Button size="sm" onClick={onClearFilters}>Clear filters</Button> : null}>
        {hasFilters ? 'No jobs match your search or filters.' : 'No jobs yet.'}
      </EmptyState>
    )
  }

  const selecting = selectedIds && selectedIds.size > 0

  return (
    <div
      ref={gridRef}
      className={cx(
        // min() keeps a single column from overflowing a narrow phone, which a
        // bare minmax(300px, 1fr) does. touch-pan-y leaves vertical scrolling
        // to the browser — the marquee is a mouse gesture and must never fight
        // the scroller on a phone.
        'relative grid touch-pan-y content-start gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]',
        'min-h-[55vh]',
        dragging && 'select-none',
      )}
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
          selecting={selecting}
          onToggleSelect={onToggleSelect}
          onSelectRange={onSelectRange}
        />
      ))}
      {rect && (
        <div
          className="pointer-events-none absolute z-[4] rounded border-[1.5px] border-ember bg-ember/[0.12]"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      )}
    </div>
  )
}
