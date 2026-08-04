import { forwardRef } from 'react'
import { cx, focusRing, focusRingOnDark } from './cx'

// One button for the whole app.
//
// Three decisions worth recording, because both old systems disagreed:
//
// 1. HEIGHT IS A TAP TARGET. `md` is 44px, Apple's minimum, because this is
//    demoed on an iPhone. `sm` is 40px for dense toolbars — the jobs UI's old
//    .btn--sm was 29px and the Finance tab's !px-3 !py-2 was ~32px, both of
//    which are a miss with a thumb.
// 2. RADIUS IS 8px. business.css declares 4px on .btn-primary, but every
//    single call site overrode it with `rounded-lg` — 8px is what has actually
//    shipped all along, so it is what the token says now.
// 3. PRIMARY HOVER IS ember-deep. styles.css darkened to #C94A22 and
//    business.css to #B83C18 for the same button. One had to go; ember-deep is
//    already a token and is the value the Finance tab ships.

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold ' +
  'whitespace-nowrap cursor-pointer select-none transition-colors ' +
  'disabled:cursor-default disabled:opacity-55 disabled:pointer-events-none'

const sizes = {
  sm: 'min-h-10 px-3 text-[13px]',
  md: 'min-h-11 px-4 text-sm',
}

const tones = {
  primary: 'border-ember bg-ember text-white hover:border-ember-deep hover:bg-ember-deep',
  secondary: 'border-line-strong bg-paper-card text-ink hover:bg-sunken',
  ghost: 'border-transparent bg-transparent text-ink-faint hover:bg-sunken hover:text-ink',
  danger: 'border-danger bg-danger text-white hover:brightness-110',
}

// The navy chrome (topbar, bulk action bar) is a nested theme: the same button
// has to read as white-on-navy there. styles.css did this with descendant
// overrides (`.topbar .btn`, `.bulkbar .btn--sm`), which is exactly the kind of
// action-at-a-distance the migration is removing — so it is an explicit prop.
const tonesOnDark = {
  primary: tones.primary,
  secondary: 'border-white/20 bg-white/[0.14] text-white hover:bg-white/25',
  ghost: 'border-transparent bg-transparent text-white/70 hover:bg-white/10 hover:text-white',
  // Salmon rather than the brick danger red, which disappears against navy.
  danger: 'border-[#ff9d86]/50 bg-transparent text-[#ff9d86] hover:bg-ember/25 hover:text-white',
}

export const Button = forwardRef(function Button(
  { tone = 'secondary', size = 'md', onDark = false, as: Tag = 'button', className, children, ...rest },
  ref,
) {
  const palette = onDark ? tonesOnDark : tones
  // A <button> with no explicit type submits the form it is inside. That has
  // caused accidental saves in this app's modals before.
  const typeProp = Tag === 'button' ? { type: rest.type || 'button' } : null

  return (
    <Tag
      ref={ref}
      {...rest}
      {...typeProp}
      className={cx(base, sizes[size] || sizes.md, palette[tone] || palette.secondary, onDark ? focusRingOnDark : focusRing, className)}
    >
      {children}
    </Tag>
  )
})

// Icon-only button. `label` is required and becomes the accessible name —
// there is no visible text to fall back on.
const iconSizes = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
}

const iconTones = {
  default: 'text-ink-faint hover:bg-sunken hover:text-ink',
  danger: 'text-ink-mute hover:bg-danger-wash hover:text-danger',
}

export const IconButton = forwardRef(function IconButton(
  { label, tone = 'default', size = 'md', onDark = false, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type || 'button'}
      aria-label={label}
      title={rest.title || label}
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent',
        'cursor-pointer transition-colors disabled:cursor-default disabled:opacity-55',
        iconSizes[size] || iconSizes.md,
        onDark ? 'text-white/70 hover:bg-white/10 hover:text-white' : iconTones[tone] || iconTones.default,
        onDark ? focusRingOnDark : focusRing,
        className,
      )}
    >
      {children}
    </button>
  )
})
