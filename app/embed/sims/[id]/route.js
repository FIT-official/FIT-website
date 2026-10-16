import { playerDocument } from '@/lib/classroomSimulations/playerDocument'

// Standalone same-origin player, without the site layout or account data.
// Existing middleware and frame-ancestor policy remain in force.
export const dynamic = 'force-dynamic'

export async function GET(_request, { params }) {
  const { id } = await params
  const html = playerDocument(id, { embed: true })
  return new Response(html ?? 'Activity not found', {
    status: html ? 200 : 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
