// Reuse the existing consent-gated PostHog source. Only aggregates leave this
// function; identifiers, IPs, full URLs and raw properties are never persisted.
export function safePagePath(properties = {}) {
  let p
  try { p = properties.$pathname || new URL(properties.$current_url).pathname } catch { return '(unknown page)' }
  p = String(p).split(/[?#]/)[0]
  if (/^\/(?:account|admin|dashboard|api|workshop|sign-in|sign-up)(?:\/|$)/.test(p)) return '(account or private area)'
  return /^\/(?:$|(?:shop|prints|products|blog|about|contact|maker-tools|community|printer-repair|3d-design-printing|research-fabrication|school-programmes|privacy|terms)(?:\/[-a-zA-Z0-9_]+)*\/?$)/.test(p) ? p.slice(0, 160) : '(other page)'
}
export async function visitorSummary(period, { env = process.env, fetchImpl = fetch, maxPages = 20, budgetMs = 10000 } = {}) {
  if (!env.POSTHOG_PROJECT_ID || !env.POSTHOG_PERSONAL_API_KEY) return { available: false, reason: 'PostHog is not configured' }
  const origin = new URL(env.POSTHOG_API_HOST || env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com').origin
  if (!origin.startsWith('https://')) return { available: false, reason: 'Invalid analytics endpoint' }
  const prefix = `/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/events/`
  let next = `${origin}${prefix}?event=%24pageview&after=${encodeURIComponent(new Date(+period.since - 1).toISOString())}&before=${encodeURIComponent(period.until.toISOString())}&limit=1000`
  const visitors = new Set(), seen = new Set(), devices = {}, countries = {}, sources = {}, paths = {}
  let views = 0, pages = 0
  const deadline = Date.now() + budgetMs
  try {
    while (next && pages < maxPages && Date.now() < deadline) {
      const url = new URL(next, origin)
      if (url.origin !== origin || url.pathname !== prefix) throw Error('Unexpected analytics pagination destination')
      const response = await fetchImpl(url.toString(), { redirect: 'error', headers: { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}` }, signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now()))) })
      if (!response.ok) throw Error('Analytics provider unavailable')
      const data = await response.json()
      if (!Array.isArray(data.results)) throw Error('Invalid analytics result')
      for (const e of data.results) {
        const at = +new Date(e.timestamp)
        if (!Number.isFinite(at) || at < +period.since || at >= +period.until || (e.event && e.event !== '$pageview')) continue
        if (e.id && seen.has(e.id)) continue
        if (e.id) seen.add(e.id)
        views++
        if (e.distinct_id != null) visitors.add(String(e.distinct_id))
        const pagePath = safePagePath(e.properties)
        paths[pagePath] = (paths[pagePath] || 0) + 1
        for (const [map, property] of [[devices,'$device_type'],[countries,'$geoip_country_code'],[sources,'$referring_domain']]) {
          let label = String(e.properties?.[property] || 'Unknown').replace(/[\u0000-\u001f]/g, '').slice(0, 80)
          if (property === '$device_type' && !['Desktop','Mobile','Tablet','Unknown'].includes(label)) label = 'Unknown'
          if (property === '$geoip_country_code' && !/^[A-Z]{2}$/.test(label)) label = 'Unknown'
          // A referring domain is not a URL; omit any query/path/userinfo.
          if (property === '$referring_domain' && !/^([a-zA-Z0-9-]+\.)+[a-zA-Z0-9-]+$/.test(label) && !['$direct','Unknown'].includes(label)) label = 'Unknown'
          map[label] = (map[label] || 0) + 1
        }
      }
      pages++; next = data.next || null
    }
    return { available: true, complete: !next, pageViews: views, uniqueVisitors: visitors.size, pages, devices, countries, sources, paths, basis: 'Consented PostHog pageviews; no raw identifiers exported' }
  } catch { return { available: false, reason: 'Analytics provider unavailable or incomplete response; no zero-traffic claim' } }
}
