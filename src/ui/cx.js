// Shared plumbing for src/ui. Nothing in here renders.

// Join class names, dropping falsy ones.
//
// Note what this deliberately is NOT: a Tailwind class merger. Two conflicting
// utilities (px-3 and px-4) resolve by their order in the generated stylesheet,
// not by their order in this string, so a caller cannot reliably override a
// component's padding by passing className. That is why every kit component
// takes props for the choices that matter (size, tone) and treats className as
// a place for layout only — margins, width, grid placement.
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

// The one focus treatment, applied to everything focusable in the kit.
//
// It is an OUTLINE rather than a box-shadow ring on purpose. styles.css sets
// `:where(a, button, [tabindex], input, select):focus-visible { outline: 2px
// solid var(--brand); outline-offset: 2px }` UNLAYERED, so it beats any
// layered Tailwind utility including focus:outline-none — the Finance tab has
// been quietly drawing both its own 1px ring and that 2px outline on every
// focused input. Matching the outline instead of fighting it means the kit
// looks identical before and after styles.css is deleted, and there is only
// ever one ring on screen.
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember'

// Same idea for a control sitting on the navy chrome, where ember-on-navy is
// hard to see.
export const focusRingOnDark =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

// Layer order, in one place, because z-index bugs are only ever found in
// production. Values match what styles.css already used so the kit and the
// unmigrated jobs UI stack correctly against each other during the migration.
//
//   20  sticky topbar
//   55  bulk action bar
//   70  full-screen job view
//   90  modals
//  100  toasts (must clear a modal — a save error is reported over the form)
export const Z = {
  bulkBar: 'z-[55]',
  overlay: 'z-[70]',
  modal: 'z-[90]',
  toast: 'z-[100]',
}
