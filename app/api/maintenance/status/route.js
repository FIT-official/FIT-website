import { readMaintenanceConfig, isBannerActive, isPageActive, formatSgtWindow, maintenanceConfigReason } from '@/lib/maintenance/config'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
    const cfg = await readMaintenanceConfig()
    const active = isBannerActive(cfg.banner)
    return Response.json({
        banner: { active, message: active ? cfg.banner.message : '', window: active ? formatSgtWindow(cfg.banner.startsAt, cfg.banner.endsAt) : '' },
        page: { active: isPageActive(cfg.page) },
        source: maintenanceConfigReason(),
    }, { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } })
}
