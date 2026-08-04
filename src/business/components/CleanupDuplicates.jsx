import { useMemo, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { useHubData, deleteJobs, gbp } from '../lib/store.js'
import { jobKey } from '../../lib/importMatch.js'
import { jobsStore } from '../../lib/jobsStore.js'
import { Button } from '../../ui'

// Clearing up after the old Finance-only importer.
//
// Finance used to have its own "Import CSV" that wrote into this section's
// calendar instead of the jobs table. Anything imported that way never
// reached the Jobs tab, and it had no duplicate checking — so a property can
// be sitting here AND as a real job, counted twice.
//
// This finds only the entries that match a real job (same postcode + house
// number, the same rule the importer uses) and offers to remove those. Work
// entered by hand that has no matching job is never touched.

export default function CleanupDuplicates() {
  const { jobs: bizJobs } = useHubData()
  const [realJobs, setRealJobs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')

  async function scan() {
    setLoading(true)
    setError('')
    try {
      setRealJobs(await jobsStore.fetchAll())
    } catch (err) {
      setError(err?.message || 'Could not read the jobs list.')
    } finally {
      setLoading(false)
    }
  }

  const dupes = useMemo(() => {
    if (!realJobs) return []
    const real = new Set(realJobs.map(jobKey))
    return (bizJobs || [])
      // Entries derived live from the Jobs tab aren't stored here at all.
      .filter((j) => !j._linked)
      .filter((j) => {
        const key = jobKey({ postcode: j.postcode, title: j.address || j.customer || '', data: {} })
        return real.has(key)
      })
  }, [bizJobs, realJobs])

  const value = dupes.reduce((s, j) => s + (Number(j.price) || 0), 0)

  function remove() {
    const n = deleteJobs(dupes.map((j) => j.id))
    setDone(`Removed ${n} duplicate calendar entr${n === 1 ? 'y' : 'ies'}.`)
    setRealJobs(null)
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Tidy up</div>
      <p className="mb-3 text-xs text-ink-faint">
        Finance used to have its own spreadsheet import that saved here instead of into your jobs.
        Anything it added never reached the Jobs tab and could double up. This finds calendar
        entries that match a real job and removes just those — anything you typed in yourself
        stays.
      </p>

      {done && <p className="mb-2 text-xs font-semibold text-accent-green">{done}</p>}
      {error && <p className="mb-2 text-xs font-semibold text-danger">{error}</p>}

      {realJobs === null ? (
        <Button size="sm" onClick={scan} disabled={loading} className="w-full">
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? 'Checking…' : 'Check for duplicates'}
        </Button>
      ) : dupes.length === 0 ? (
        <p className="text-xs font-semibold text-accent-green">Nothing to clean up — no entries here match a job.</p>
      ) : (
        <>
          <div className="mb-2 max-h-40 overflow-y-auto rounded-lg border border-line">
            <ul className="divide-y divide-line">
              {dupes.slice(0, 40).map((j) => (
                <li key={j.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate">{j.address || j.customer || 'Entry'}</span>
                  <span className="shrink-0 font-mono text-ink-faint">{j.postcode}</span>
                  {Number(j.price) > 0 && <span className="shrink-0 font-semibold">{gbp.format(j.price)}</span>}
                </li>
              ))}
              {dupes.length > 40 && <li className="px-3 py-1.5 text-xs text-ink-mute">…and {dupes.length - 40} more</li>}
            </ul>
          </div>
          <Button size="sm" tone="danger" onClick={remove} className="w-full">
            <Trash2 size={14} /> Remove {dupes.length} duplicate{dupes.length === 1 ? '' : 's'}
            {value > 0 && ` (${gbp.format(value)} double-counted)`}
          </Button>
        </>
      )}
    </div>
  )
}
