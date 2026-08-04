import { cx, focusRing } from './cx'

// Pick one of two to four things.
//
// The jobs UI drew an inset track with a raised active pill; the Finance tab
// drew loose pills with a filled-navy active state, at three different
// paddings. The inset track wins because it reads as "one control, one choice"
// — loose pills look like independent toggles, and the Finance tab genuinely
// does have loose toggle pills elsewhere that would then be indistinguishable.
//
// `mode` picks the semantics, which are NOT the same thing:
//   tabs  — switching which view you are looking at (Jobs / Projects / Calendar)
//   radio — choosing a value in a form (Per job / Split)
// Announcing a form choice as a tab sends screen-reader users looking for a
// panel that does not exist.

export function SegmentedControl({
  options = [],
  value,
  onChange,
  label,
  mode = 'tabs',
  full = false,
  className,
}) {
  const isTabs = mode === 'tabs'
  return (
    <div
      role={isTabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={cx(
        'rounded-full border border-line bg-sunken p-1',
        // full stretches to the container — the right default on a phone,
        // where a centred pill leaves two dead columns either side.
        full ? 'flex w-full gap-1' : 'inline-flex gap-1',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            {...(isTabs ? { 'aria-selected': active } : { 'aria-checked': active })}
            onClick={() => onChange?.(opt.value)}
            className={cx(
              'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-4',
              'text-sm font-medium transition-colors',
              full && 'flex-1',
              active ? 'bg-paper-card text-ink shadow-hairline' : 'text-ink-faint hover:text-ink',
              focusRing,
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
