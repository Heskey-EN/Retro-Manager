// The shared UI kit.
//
// One design system for all three sections. Everything here is Tailwind
// utilities over the @theme tokens in src/tailwind.css — no new global class
// names, because src/styles.css is UNLAYERED and any bare name it or Tailwind
// also ships wins the cascade by origin, not specificity. That is how the
// Finance tab once rendered as a single 4,976px column.
//
// Rules for anything added here:
//   · Mobile first. Text inputs are 16px or iOS zooms; tap targets are 44px.
//   · Tokens from @theme only — never a styles.css variable (--brand, --line,
//     --sh-1 …). Those die with styles.css.
//   · No className that is a bare word Tailwind or daisyUI ships.
//   · Must work identically inside and outside the "biz" wrapper. It carries
//     no styles of its own, so this holds as long as nothing here inherits a
//     size or a face rather than setting it.
//
// Usage: import { Button, Field, Input } from '../ui'

export { cx, focusRing, focusRingOnDark, Z } from './cx'
export { Button, IconButton } from './Button'
export { Field, FieldRow, Input, Select, Textarea, inputClass } from './Field'
export { Modal } from './Modal'
export { Card, CardHead, CardBody } from './Card'
export { Chip, StatusChip, FilterChip } from './Chip'
export { Toast } from './Toast'
export { Banner } from './Banner'
export { EmptyState } from './EmptyState'
export { SegmentedControl } from './SegmentedControl'
export { SpecLabel, Mono } from './Typography'
