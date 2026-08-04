// Moved to src/lib/dates.js when the three calendars became one — the shared
// calendar needed these helpers and must not invent a fourth set of date maths.
// Re-exported from here so the Finance tab's existing imports keep working.
export * from '../../lib/dates.js'
