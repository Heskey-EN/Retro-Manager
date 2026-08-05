import { cx, Z } from './cx'

// The transient message, bottom-centre.
//
// Only the jobs UI had one; the Finance tab used window.alert() and inline
// paragraphs that scrolled off screen. It is already half-shared — the
// Dashboard is handed the jobs UI's pushToast — so this is the styling
// catching up with the wiring.
//
// `tone` takes the same strings App.jsx already stores on a toast
// ({ type: 'success' | 'error', text, action }), so nothing has to be renamed
// when the toast state moves onto the kit.

const tones = {
  success: 'bg-moss-strong',
  error: 'bg-danger',
  info: 'bg-navy',
}

export function Toast({ tone = 'info', action, onDismiss, className, children, ...rest }) {
  return (
    <div
      {...rest}
      role="status"
      aria-live="polite"
      className={cx(
        // env() is 0 on everything except an iPhone, where it clears the home
        // indicator — without it the toast sits under the swipe bar.
        // --bulk-bar-h is published by BulkActionsBar while a selection is
        // live and is 0 otherwise: the toast is z-100 and the bar z-55, so
        // without it a "Moved 3 jobs" message landed square on top of the
        // bar's own Assign / Costs / Archive / Delete row.
        'fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom)+var(--bulk-bar-h,0px))] left-1/2 -translate-x-1/2',
        'inline-flex max-w-[min(90vw,32rem)] items-center gap-3.5 rounded-full px-4.5 py-2.5',
        'text-sm text-white shadow-overlay motion-safe:animate-fade-up',
        tones[tone] || tones.info,
        Z.toast,
        className,
      )}
    >
      <span className="min-w-0">{children}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 cursor-pointer rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 cursor-pointer text-white/70 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          ✕
        </button>
      )}
    </div>
  )
}
