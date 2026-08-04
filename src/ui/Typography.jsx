import { cx } from './cx'

// The two bits of type that get re-invented everywhere.

// The small mono "spec" label above a heading or a figure — the technical
// voice in the Eco Futures family. styles.css called it .eyebrow (10.5px,
// 0.14em, always ember); business.css calls it .spec (11.2px, 0.18em, colour
// from the caller). Same object, so: business.css's metrics, styles.css's
// default colour.
export function SpecLabel({ as: Tag = 'p', tone = 'ember', className, children, ...rest }) {
  return (
    <Tag
      {...rest}
      className={cx(
        'font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em]',
        tone === 'ember' ? 'text-ember-deep' : tone === 'faint' ? 'text-ink-mute' : 'text-ink-faint',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

// Numbers that sit in a column: references, dates, money.
//
// tabular-nums is the whole point and it is NOT part of Tailwind's font-mono.
// Without it a total that changes from £1,111 to £8,888 changes width, so
// every figure in the costing panel shuffles sideways as you type.
export function Mono({ as: Tag = 'span', className, children, ...rest }) {
  return <Tag {...rest} className={cx('font-mono tabular-nums', className)}>{children}</Tag>
}
