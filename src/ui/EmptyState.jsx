import { cx } from './cx'

// "There's nothing here" — the one thing every list needs and neither system
// had a shared answer for. The jobs UI had .placeholder and a separate
// full-page .empty-hero; the Finance tab wrote a bare <p className="text-sm
// text-slate-500"> six different times.
//
// Three sizes of the same idea:
//   compact — inside a card or a list, a line of quiet text
//   default — an empty tab or panel
//   hero    — the first-run screen, when the app has no data at all

const pads = {
  compact: 'px-4 py-6 gap-2',
  default: 'px-5 py-14 gap-3',
  hero: 'px-5 py-12 sm:py-16 gap-4',
}

export function EmptyState({ size = 'default', icon, title, action, className, children, ...rest }) {
  const hero = size === 'hero'
  return (
    <div {...rest} className={cx('flex flex-col items-center justify-center text-center', pads[size] || pads.default, className)}>
      {icon && <div className="text-ink-mute" aria-hidden>{icon}</div>}
      {title && (
        <h2 className={cx('font-display font-semibold text-ink', hero ? 'text-2xl sm:text-3xl' : 'text-base')}>
          {title}
        </h2>
      )}
      {children && (
        <p className={cx('max-w-lg text-ink-faint', hero ? 'text-[15px] leading-relaxed' : 'text-sm')}>{children}</p>
      )}
      {/* mt on the wrapper rather than the button, so a caller can put two
          buttons or a whole dropzone in here and the spacing still holds. */}
      {action && <div className="mt-1 flex flex-col items-center gap-3">{action}</div>}
    </div>
  )
}
