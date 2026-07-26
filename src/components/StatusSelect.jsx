import { STATUSES, statusColor, statusLabel } from '../lib/status'

// A compact status pill that colours itself to match the current stage.
export default function StatusSelect({ value, onChange, size = 'md' }) {
  return (
    <span className={`status-pill status-pill--${size}`} style={{ '--status-color': statusColor(value) }}>
      <span className="status-pill__dot" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Job stage"
        onClick={(e) => e.stopPropagation()}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </span>
  )
}
