// Shared by middleware and server routes. No Node APIs or SDK dependency.
const TTL_MS = 10_000
const TIMEOUT_MS = 1_500
const OFF = Object.freeze({
    banner: Object.freeze({ enabled: false, message: '', startsAt: null, endsAt: null }),
    page: Object.freeze({ enabled: false, title: '', message: '', until: null }),
})
let cached = { source: null, expires: 0, value: OFF }
let pending = null
let lastReason = 'init'
// Non-secret reason code for the last read, for operators (never includes the URL or token).
export function maintenanceConfigReason() { return lastReason }

function validDate(value) {
    return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)))
}

function normalize(items) {
    const banner = items?.maintenance_banner
    const page = items?.maintenance_page
    if (!banner || !page || typeof banner.enabled !== 'boolean' || typeof page.enabled !== 'boolean'
        || typeof banner.message !== 'string' || typeof page.title !== 'string' || typeof page.message !== 'string'
        || !validDate(banner.startsAt) || !validDate(banner.endsAt) || !validDate(page.until)) return OFF
    return Object.freeze({
        banner: Object.freeze({ enabled: banner.enabled, message: banner.message, startsAt: banner.startsAt, endsAt: banner.endsAt }),
        page: Object.freeze({ enabled: page.enabled, title: page.title, message: page.message, until: page.until }),
    })
}

async function fetchConfig(source) {
    const controller = new AbortController()
    let timer
    let stage = 'url'
    try {
        const url = new URL(source)
        if (url.origin !== 'https://edge-config.vercel.com' || url.username || url.password
            || !/^\/ecfg_[a-z0-9]+\/?$/i.test(url.pathname) || !url.searchParams.get('token')) { lastReason = 'bad-source'; return OFF }
        const token = url.searchParams.get('token')
        // The Edge Config read API authenticates with a bearer header; keep the token out of the URL.
        url.search = ''
        url.pathname = `${url.pathname.replace(/\/$/, '')}/items`
        url.hash = ''
        // Bound both fetching and body decoding. Never retain stale ON after a failure.
        return await Promise.race([
            (async () => {
                stage = 'fetch'
                const response = await fetch(url, { cache: 'no-store', signal: controller.signal, redirect: 'manual', headers: { Authorization: `Bearer ${token}` } })
                if (!response.ok) { lastReason = `http-${response.status}`; return OFF }
                const value = normalize(await response.json())
                lastReason = value === OFF ? 'invalid-items' : 'ok'
                return value
            })(),
            new Promise(resolve => { timer = setTimeout(() => { lastReason = 'timeout'; controller.abort(); resolve(OFF) }, TIMEOUT_MS) }),
        ])
    } catch (error) {
        lastReason = `error-${stage}-${error?.name || 'unknown'}:${String(error?.message || '').replace(/token=[^&\s]*/gi, 'token=x').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, 'x').slice(0, 80)}`
        return OFF
    } finally {
        clearTimeout(timer)
        controller.abort()
    }
}

export async function readMaintenanceConfig() {
    try {
        const source = process.env.EDGE_CONFIG
        if (!source) { lastReason = 'no-source'; return OFF }
        if (cached.source === source && Date.now() < cached.expires) return cached.value
        if (pending?.source === source) return await pending.promise
        const promise = fetchConfig(source).then(value => {
            cached = { source, value, expires: Date.now() + TTL_MS }
            return value
        })
        const current = { source, promise }
        pending = current
        try { return await promise } finally { if (pending === current) pending = null }
    } catch {
        return OFF
    }
}

function beforeExpiry(value, now) {
    return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)) && Number(now) < Date.parse(value))
}

// startsAt describes the planned work: an enabled announcement is visible before it.
export function isBannerActive(cfg, now = Date.now()) {
    return cfg?.enabled === true && beforeExpiry(cfg.endsAt, now)
}

export function isPageActive(cfg, now = Date.now()) {
    return cfg?.enabled === true && beforeExpiry(cfg.until, now)
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function parts(date) { return Object.fromEntries(dayFormat.formatToParts(date).map(part => [part.type, part.value])) }
function day(date, year) {
    const p = parts(date)
    return `${p.weekday} ${p.day} ${p.month}${year ? ` ${p.year}` : ''}`
}

export function formatSgtWindow(startsAt, endsAt) {
    const start = typeof startsAt === 'string' && Number.isFinite(Date.parse(startsAt)) ? new Date(startsAt) : null
    const end = typeof endsAt === 'string' && Number.isFinite(Date.parse(endsAt)) ? new Date(endsAt) : null
    if (!start && !end) return ''
    if (!start) return `Until ${day(end)}, ${timeFormat.format(end)} SGT`
    if (!end) return `${day(start)}, ${timeFormat.format(start)} SGT`
    const sameDay = dayFormat.format(start) === dayFormat.format(end)
    const crossYear = parts(start).year !== parts(end).year
    return `${day(start, crossYear)}, ${timeFormat.format(start)}–${sameDay ? '' : `${day(end, crossYear)}, `}${timeFormat.format(end)} SGT`
}
