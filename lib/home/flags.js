import { readEdgeConfigItems } from '@/lib/maintenance/config'

export const HOME_SECTIONS = Object.freeze([
    'hero', 'trust', 'services', 'visit', 'bulk', 'shop', 'creators',
    'reviews', 'clientLogos', 'faq', 'guides', 'newsletter', 'whatsapp',
])

export function normalizeHomeFlag(value) {
    const sections = Object.fromEntries(HOME_SECTIONS.map(name => [name, value?.sections?.[name] !== false]))
    return { enabled: value?.enabled === true, sections }
}

export async function readHomeFlag() {
    try { return normalizeHomeFlag((await readEdgeConfigItems())?.home_v2) }
    catch { return normalizeHomeFlag(null) }
}

export function shouldRenderHomeV2(searchParams, flag) {
    const values = Array.isArray(searchParams?.home) ? searchParams.home : [searchParams?.home]
    if (values.includes('v1')) return false
    return values.includes('v2') || flag?.enabled === true
}
