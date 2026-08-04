import { cx } from './cx'

// One card recipe.
//
// The app had six: .job-card, .project, .timeline, .jobview__box and
// .templates__editor on the jobs side (12px radius, --line border, --sh-1),
// and three more on the Tailwind side (rounded-xl/slate-200/shadow-sm,
// rounded-lg/ink-10/shadow-card, rounded-2xl/ink-10/shadow-lift). Three
// near-identical greys, three radii and three shadows describing the same
// object. This is that object.
//
// Use <Card pad> for a plain box, or <Card pad={false}> with CardHead/CardBody
// when it needs a titled header strip with a divider.

// The surface a card is drawn on. This is a PROP rather than something a
// caller passes in className, because both are Tailwind utilities and which one
// wins is decided by their order in the generated stylesheet, not by the order
// of the class string — `<Card className="bg-ember">` silently renders paper.
const surfaces = {
  default: 'border-line bg-paper-card',
  // The Dashboard's "Add a job" tile: a filled call to action that is still
  // the same object as the card beside it.
  ember: 'border-ember bg-ember text-white',
}

export function Card({ as: Tag = 'div', pad = true, interactive = false, tone = 'default', className, children, ...rest }) {
  return (
    <Tag
      {...rest}
      className={cx(
        'rounded-xl border shadow-hairline',
        surfaces[tone] || surfaces.default,
        pad && 'p-4',
        // Only for cards that are themselves a button/link. A hover lift on a
        // card you cannot click is a promise the UI does not keep.
        interactive &&
          'cursor-pointer transition-[transform,box-shadow,border-color] hover:border-line-strong hover:shadow-card motion-safe:hover:-translate-y-0.5',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardHead({ title, children, className }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3', className)}>
      {/* No margin utility on the heading. styles.css sets `h1,h2,h3 { margin:
          0 }` unlayered, which beats every mb-* — ten headings in the Finance
          tab carry one today and none of them does anything. Spacing lives on
          the container instead, which is also correct once styles.css is gone. */}
      {title && <h2 className="font-display text-base font-bold text-ink">{title}</h2>}
      {children}
    </div>
  )
}

export function CardBody({ className, children }) {
  return <div className={cx('px-4 py-4', className)}>{children}</div>
}
