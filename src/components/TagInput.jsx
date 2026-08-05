import { useState } from 'react'
import { X } from 'lucide-react'
import { Chip, cx } from '../ui'

// A chip-based tag editor. Enter or comma commits a tag; Backspace on an empty
// field removes the last one. Tags are de-duplicated case-insensitively.
export default function TagInput({ value = [], onChange, placeholder = 'Add tag…', className }) {
  const [text, setText] = useState('')

  const add = (raw) => {
    const t = raw.trim()
    if (!t) return
    if (!value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t])
    setText('')
  }
  const removeAt = (i) => onChange(value.filter((_, idx) => idx !== i))

  return (
    // The whole well is the control, so the focus ring belongs on it and not on
    // the bare input inside — see the inline outline below.
    <div
      className={cx(
        'flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-paper-card px-2 py-1.5',
        'focus-within:border-ember focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ember',
        className,
      )}
    >
      {value.map((t, i) => (
        <Chip key={t} tone="ember" size="sm">
          {t}
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={`Remove ${t}`}
            // 32px on a phone rather than 24. It cannot be grown with a
            // pseudo-element the way an isolated icon button can: Chip wraps
            // its children in a `truncate` span, which is overflow:hidden and
            // would clip any hit area reaching outside the pill.
            className="-mr-1 ml-0.5 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-ember/20 sm:h-6 sm:w-6"
          >
            <X size={12} />
          </button>
        </Chip>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(text)
          } else if (e.key === 'Backspace' && !text && value.length) {
            removeAt(value.length - 1)
          }
        }}
        onBlur={() => text.trim() && add(text)}
        placeholder={value.length ? '' : placeholder}
        // Inline, not a utility: styles.css's unlayered a11y floor draws a 2px
        // outline on every focused input and beats any layered class, so the
        // wrapper's ring and this one would both show. The wrapper is the one
        // that describes the control, and this stays right once styles.css is
        // deleted.
        style={{ outline: 'none' }}
        className="min-w-[7rem] flex-1 border-0 bg-transparent p-0 text-base text-ink placeholder:text-ink-mute"
      />
    </div>
  )
}
