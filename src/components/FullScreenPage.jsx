import { ChevronLeft, X } from 'lucide-react'
import { Button, Card, IconButton, Z, cx } from '../ui'

// The full-screen page: the job view and the templates manager.
//
// Both used to share the .jobview* block in styles.css, which is why the
// inventory said the two files had to migrate together — a shell described in
// CSS can only be shared by two components agreeing to use the same class
// name. Here it is one component instead, so there is nothing to keep in sync.
//
// It covers the topbar rather than sitting under it, hence the safe-area
// padding on the header: on an iPhone the notch would otherwise eat the back
// button, which is the only way out of the page.

export default function FullScreenPage({ backLabel = 'Back', onClose, actions, children }) {
  return (
    <div
      className={cx(
        'fixed inset-0 overflow-y-auto bg-paper',
        // Its own scroll container, so it needs its own scroll-padding — the
        // :root rule in styles.css only governs the page behind it. One header
        // row here, so a constant is honest.
        'scroll-pt-[calc(4.5rem+env(safe-area-inset-top))]',
        // fade-IN, not fade-up — opacity only, nothing that computes to a
        // transform. fade-up runs with fill-mode: both, so its final
        // translateY(0) sticks as an identity matrix for good, and a
        // transformed ancestor is the containing block for every
        // position: fixed inside it: the first modal opened from a job would
        // then position against this scrolled overlay rather than the viewport.
        'motion-safe:animate-fade-in',
        Z.overlay,
      )}
    >
      <header
        className={cx(
          'sticky top-0 z-[2] flex items-center justify-between gap-2 border-b border-line px-3 pb-2 sm:px-6',
          // pt-, not py-: padding-block and padding-top are different
          // properties, so which one lands is decided by their order in the
          // generated stylesheet rather than by the order written here.
          'pt-[calc(0.5rem+env(safe-area-inset-top))]',
          // OPAQUE. It was 85% + a backdrop blur, which is frosted glass where
          // backdrop-filter works and plain ghosted text where iOS drops it —
          // the page's own words showing through the header is exactly the
          // "information is behind the header" complaint.
          'bg-paper-card shadow-hairline',
        )}
      >
        <Button tone="ghost" onClick={onClose}>
          <ChevronLeft size={18} aria-hidden />
          {backLabel}
        </Button>
        <div className="flex items-center gap-2">
          {actions}
          <IconButton label="Close" onClick={onClose}>
            <X size={20} aria-hidden />
          </IconButton>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[70rem] flex-col gap-5 px-4 pb-16 pt-5 sm:px-6 sm:pb-20">
        {children}
      </div>
    </div>
  )
}

// A titled box inside a full-screen page. The title is an <h2> with no margin
// utility on it deliberately: styles.css sets `h1, h2, h3 { margin: 0 }`
// unlayered, so every mb-* on a heading in this app is silently doing nothing.
// Spacing lives on the flex container, which is also the right answer once
// styles.css is gone.
export function PageCard({ title, hint, headAction, className, children }) {
  return (
    <Card pad={false} className={cx('flex flex-col gap-3 p-4 sm:p-5', className)}>
      {(title || hint || headAction) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-base font-semibold text-ink">{title}</h2>}
            {hint && <p className="mt-1 text-[13px] leading-snug text-ink-faint">{hint}</p>}
          </div>
          {headAction}
        </div>
      )}
      {children}
    </Card>
  )
}
