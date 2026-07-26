import { useState } from 'react'

// A small chip-based tag editor. Enter or comma commits a tag; Backspace on an
// empty field removes the last one. Tags are de-duplicated case-insensitively.
export default function TagInput({ value = [], onChange, placeholder = 'Add tag…' }) {
  const [text, setText] = useState('')

  const add = (raw) => {
    const t = raw.trim()
    if (!t) return
    if (!value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t])
    setText('')
  }
  const removeAt = (i) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div className="taginput">
      {value.map((t, i) => (
        <span className="tag" key={t}>
          {t}
          <button type="button" className="tag__x" onClick={() => removeAt(i)} aria-label={`Remove ${t}`}>×</button>
        </span>
      ))}
      <input
        className="taginput__field"
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
      />
    </div>
  )
}
