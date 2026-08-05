import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx, focusRing } from './cx'

// Text inputs, and the label that goes above them.
//
// THE 16px RULE. Every control here is text-base (16px) and there is no size
// prop that makes it smaller. iOS Safari zooms the whole page whenever a
// focused input's font-size is under 16px, and the user then has to pinch back
// out — on a phone that reads as the app being broken. The jobs UI shipped
// ELEVEN different input sizes between 11px and 14px, every one of which does
// this; that is the single biggest thing the kit fixes.
//
// Height is min-h-11 (44px) for the same reason buttons are: thumbs.

export const inputClass = cx(
  'w-full min-h-11 rounded-lg border border-line-strong bg-paper-card px-3 py-2.5',
  'text-base text-ink placeholder:text-ink-mute',
  'transition-colors focus:border-ember disabled:cursor-default disabled:opacity-60',
  focusRing,
)

// Label above a control.
//
// Renders a <label> wrapping its child, so no id plumbing is needed and the
// tap target includes the label text. Pass as="div" when the "control" is a
// group (radios, a segmented control, a tag editor) — a <label> wrapping more
// than one control has undefined behaviour when clicked.
export function Field({ label, hint, error, as: Tag = 'label', className, children, ...rest }) {
  return (
    // grid-cols-[minmax(0,1fr)], not a bare `grid`: the implicit track is
    // `auto`, whose floor is min-content, so a Field inside a narrow column
    // was sized by its widest child rather than by the column. In the Add-a-job
    // sheet's two-up Day/Time row that made a 171px date input overhang a 162px
    // cell. min-w-0 alone does not fix it — the track is the thing that grows.
    <Tag {...rest} className={cx('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5', className)}>
      {label && (
        <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">{label}</span>
      )}
      {children}
      {hint && !error && <span className="text-xs text-ink-faint">{hint}</span>}
      {error && <span className="text-xs font-semibold text-danger">{error}</span>}
    </Tag>
  )
}

export const Input = forwardRef(function Input({ mono = false, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      // tabular-nums, not just the mono face: a column of prices that is not
      // fixed-width visibly jitters as you type into it.
      className={cx(inputClass, mono && 'font-mono tabular-nums', className)}
    />
  )
})

export const Textarea = forwardRef(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} {...rest} className={cx(inputClass, 'min-h-24 resize-y leading-normal', className)} />
})

export const Select = forwardRef(function Select({ className, children, ...rest }, ref) {
  return (
    // The caret is drawn by us because `appearance: none` removes the native
    // one, and the native one cannot be recoloured. styles.css drew it with two
    // stacked linear-gradients; an icon is the same picture and readable.
    <div className={cx('relative flex min-w-0 items-center', className)}>
      <select ref={ref} {...rest} className={cx(inputClass, 'appearance-none pr-9')}>
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute right-3 text-ink-faint"
      />
    </div>
  )
})

// A row of fields that is one column on a phone and two from 640px up. The old
// .modal__row was two columns at every width and only collapsed under a 720px
// media query, which put two 150px-wide date inputs side by side on a 375px
// screen for the whole range in between.
export function FieldRow({ className, children }) {
  return <div className={cx('grid gap-3.5 sm:grid-cols-2', className)}>{children}</div>
}
