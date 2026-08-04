import { cx } from './cx'

// An inline message attached to something on the page — a failed save above a
// form, a warning inside a dialog, an import result.
//
// Four rules did this job with four different treatments (.alert,
// .modal__error, .modal__warn, .upload-msg--success/--error) and the Finance
// tab used window.alert(), which cannot be styled and blocks the page. Use a
// Toast for something transient; use this for something that must stay put
// next to the thing it is about.

const tones = {
  danger: 'border-danger/25 bg-danger-wash text-danger',
  warn: 'border-amber/40 bg-amber/[0.14] text-amber-deep',
  success: 'border-moss/30 bg-moss-wash text-moss-deep',
  info: 'border-line bg-sunken text-ink-soft',
}

export function Banner({ tone = 'info', icon, className, children, ...rest }) {
  return (
    <div
      // role="alert" interrupts a screen reader, which is right for an error
      // and rude for a hint.
      role={tone === 'danger' ? 'alert' : undefined}
      {...rest}
      className={cx(
        'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-snug',
        tones[tone] || tones.info,
        className,
      )}
    >
      {icon && <span className="mt-px shrink-0" aria-hidden>{icon}</span>}
      <span className="min-w-0">{children}</span>
    </div>
  )
}
