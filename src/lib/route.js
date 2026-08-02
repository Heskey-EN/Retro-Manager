// Planning a day of visits: turn a list of UK postcodes into a sensible
// running order, a time slot for each, and a message you can send the
// customer.
//
// Geocoding uses postcodes.io — a free, no-key public UK postcode service.
// Only the POSTCODE is ever sent (never a name, house number or note). If it
// is unreachable the planner still works: it keeps the order you typed and
// says so, rather than failing.

const API = 'https://api.postcodes.io/postcodes'

export const normalisePostcode = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ')

// Rough UK postcode shape — deliberately permissive, the API is the real judge.
export const looksLikePostcode = (s) =>
  /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(String(s || '').trim())

// Straight-line distance in km (haversine). Good enough to ORDER stops; the
// travel estimate below turns it into a road-time guess.
export function distanceKm(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Roads are never straight: 1.3x is the usual detour factor for UK driving,
// and 40 km/h is a realistic door-to-door average once you include parking.
const DETOUR = 1.3
const AVG_KMH = 40
export function travelMinutes(a, b) {
  const km = distanceKm(a, b) * DETOUR
  return Math.max(5, Math.round((km / AVG_KMH) * 60))
}

// Look up several postcodes at once. Returns a Map of normalised postcode ->
// { lat, lon } for the ones that resolved; unknown postcodes are simply absent.
export async function geocode(postcodes) {
  const list = [...new Set(postcodes.map(normalisePostcode).filter(Boolean))]
  const found = new Map()
  if (!list.length) return found
  // postcodes.io accepts 100 per request.
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100)
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: chunk }),
    })
    if (!res.ok) throw new Error(`Postcode lookup failed (${res.status})`)
    const body = await res.json()
    for (const row of body.result || []) {
      if (row.result?.latitude != null) {
        found.set(normalisePostcode(row.query), { lat: row.result.latitude, lon: row.result.longitude })
      }
    }
  }
  return found
}

// Nearest-neighbour ordering from a chosen start. Not the theoretical optimum
// (that's the travelling-salesman problem), but for the 3–15 stops a day
// actually holds it removes the obvious back-and-forth, which is the point.
export function orderStops(stops, coords, startFrom) {
  const located = stops.filter((s) => coords.has(normalisePostcode(s.postcode)))
  const unlocated = stops.filter((s) => !coords.has(normalisePostcode(s.postcode)))
  if (located.length <= 1) return [...located, ...unlocated]

  const at = (s) => coords.get(normalisePostcode(s.postcode))
  const remaining = [...located]
  // Start from the requested stop if given, otherwise the first one typed.
  let currentIdx = 0
  if (startFrom) {
    const i = remaining.findIndex((s) => normalisePostcode(s.postcode) === normalisePostcode(startFrom))
    if (i > -1) currentIdx = i
  }
  const ordered = [remaining.splice(currentIdx, 1)[0]]
  while (remaining.length) {
    const last = at(ordered[ordered.length - 1])
    let best = 0
    let bestD = Infinity
    remaining.forEach((s, i) => {
      const d = distanceKm(last, at(s))
      if (d < bestD) { bestD = d; best = i }
    })
    ordered.push(remaining.splice(best, 1)[0])
  }
  // Postcodes that didn't resolve keep their typed order, at the end.
  return [...ordered, ...unlocated]
}

const pad = (n) => String(n).padStart(2, '0')
export const minutesToTime = (m) => `${pad(Math.floor((m % 1440) / 60))}:${pad(m % 60)}`
export const timeToMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60
}

// Walk the ordered stops, giving each an arrival time and a slot window.
// `slack` widens the promise to the customer so a slow job doesn't make every
// later appointment a broken promise.
export function buildSchedule(ordered, coords, { startTime = '09:00', jobMinutes = 45, slackMinutes = 30 } = {}) {
  let clock = timeToMinutes(startTime)
  return ordered.map((stop, i) => {
    if (i > 0) {
      const prev = coords.get(normalisePostcode(ordered[i - 1].postcode))
      const here = coords.get(normalisePostcode(stop.postcode))
      clock += prev && here ? travelMinutes(prev, here) : 20 // unknown hop: allow 20 min
    }
    const arrive = clock
    clock += jobMinutes
    return {
      ...stop,
      order: i + 1,
      arrive: minutesToTime(arrive),
      slotStart: minutesToTime(arrive),
      slotEnd: minutesToTime(arrive + slackMinutes),
      travelFromPrev: i === 0 ? 0 : undefined,
    }
  })
}

const LONG_DATE = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

// The message that actually gets sent to the customer. Plain, polite, and
// short enough to read on a lock screen.
export function customerMessage(stop, dateIso, businessName = 'Eco Futures') {
  const where = [stop.address, stop.postcode].filter(Boolean).join(', ')
  return [
    `Hi${stop.customer ? ` ${stop.customer}` : ''},`,
    '',
    `Your appointment with ${businessName} is booked for ${LONG_DATE(dateIso)} between ${stop.slotStart} and ${stop.slotEnd}.`,
    '',
    `Address: ${where}`,
    '',
    'Please make sure someone over 18 is home and that we can get to the loft hatch and meters. If the time does not suit, just reply and we will rearrange.',
    '',
    'Thank you,',
    businessName,
  ].join('\n')
}

// One planning call: geocode, order, schedule. Never throws for a bad
// postcode — it reports which ones it couldn't place so the UI can say so.
export async function planRoute(stops, { startTime, jobMinutes, slackMinutes, startFrom } = {}) {
  const clean = stops.filter((s) => normalisePostcode(s.postcode))
  let coords = new Map()
  let geocodeFailed = false
  try {
    coords = await geocode(clean.map((s) => s.postcode))
  } catch {
    geocodeFailed = true // offline or API down: fall back to typed order
  }
  const ordered = coords.size ? orderStops(clean, coords, startFrom) : clean
  const schedule = buildSchedule(ordered, coords, { startTime, jobMinutes, slackMinutes })
  const unplaced = clean
    .filter((s) => !coords.has(normalisePostcode(s.postcode)))
    .map((s) => s.postcode)
  return { schedule, unplaced, geocodeFailed, optimised: coords.size > 1 && !geocodeFailed }
}
