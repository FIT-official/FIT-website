import AccessNotice from '@/components/ResearchProjects/AccessNotice'
import Library from '@/components/ResearchProjects/Library'
import { projectSummaries } from '@/lib/researchProjects/content'
import { defaultDeps } from '@/lib/researchProjects/deps'
import { getPageAccess } from '@/lib/researchProjects/pageAccess'

export const dynamic = 'force-dynamic'

// Access is decided on the server for every request. Unauthorised visitors get one neutral notice and
// no project data; summaries are only read after the check passes.
export default async function ProjectsPage() {
  const access = await getPageAccess(defaultDeps())
  if (!access.ok) return <AccessNotice status={access.status} />
  return <Library projects={projectSummaries()} role={access.role} />
}
