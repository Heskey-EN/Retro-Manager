import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cx, Z } from './cx'
import { IconButton } from './Button'

// The one dialog.
//
// On a phone it is a bottom sheet — anchored to the bottom edge, rounded on
// top only, and padded past the home indicator. That is not decoration: a
// centred box on a 375px screen puts its buttons in the middle of the display
// where a thumb cannot reach, and gets shoved around by the software keyboard.
// From 640px up it becomes the familiar centred card.
//
// The body scrolls, always. styles.css's base .modal was `overflow: hidden`
// with no height cap, so a long form was simply cut off, and a second class
// (.modal--tall) existed to work around it. One modal that always scrolls is
// one fewer thing to remember.

// Locking <body> is refcounted because a dialog can open on top of a dialog
// (bulk costing over the job view). Restoring on the first close would let the
// page behind the remaining modal scroll again.
let lockCount = 0
let restoreOverflow = ''

function useBodyScrollLock() {
  useEffect(() => {
    if (lockCount === 0) {
      restoreOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount += 1
    return () => {
      lockCount -= 1
      if (lockCount === 0) document.body.style.overflow = restoreOverflow
    }
  }, [])
}

const widths = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
}

export function Modal({ title, subtitle, onClose, size = 'md', footer, className, children }) {
  useBodyScrollLock()

  useEffect(() => {
    if (!onClose) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={cx(
        'fixed inset-0 flex items-end justify-center bg-navy/60 backdrop-blur-sm sm:items-center sm:p-4',
        Z.modal,
      )}
      // mousedown, not click: starting a drag inside the panel and releasing
      // over the backdrop (selecting text, dragging a slider) would otherwise
      // throw away whatever the user had typed.
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'flex w-full flex-col overflow-hidden bg-paper-card shadow-overlay',
          'max-h-[92dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]',
          'sm:max-h-[86vh] sm:rounded-2xl sm:pb-0',
          'motion-safe:animate-fade-up',
          widths[size] || widths.md,
          className,
        )}
      >
        {(title || onClose) && (
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              {title && <h2 className="font-display text-lg font-bold leading-tight text-ink">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
            </div>
            {onClose && (
              <IconButton label="Close" size="sm" onClick={onClose} className="-mr-1.5 -mt-1">
                <X size={20} />
              </IconButton>
            )}
          </header>
        )}

        {/* min-h-0 is what actually lets this scroll: a flex child's default
            min-height is its content, so without it the panel grows past
            max-h and the page scrolls instead of the body.
            overscroll-contain because the body-overflow lock above does NOT
            stop a touch scroll on iOS: without it, flicking past the end of a
            long form scrolls the board behind the sheet instead. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
