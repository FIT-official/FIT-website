import { playerDocument } from '@/lib/classroomSimulations/playerDocument'
import { readHtmlSim, htmlSimResponse } from '@/lib/classroomSimulations/htmlSimDocument'
import { getLiveSim } from '@/lib/sims/registry'

// Extensionless entrypoints inherit FIT's unchanged maintenance/onboarding gate.
// Keep documents uncached so fresh navigation cannot reuse stale HTML responses
// across maintenance decisions. Model code/assets remain ordinary static files.
export const dynamic = 'force-dynamic'

export async function GET(_request, { params }) {
  const { activity } = await params
  if (getLiveSim(activity)?.kind === 'html') {
    const html = readHtmlSim(activity)
    if (html) return htmlSimResponse(html)
  }
  const html = playerDocument(activity)
  return new Response(html ?? 'Activity not found', {
    status: html ? 200 : 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
