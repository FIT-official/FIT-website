import { notFound } from 'next/navigation'
import AccessNotice from '@/components/ResearchProjects/AccessNotice'
import ProjectWorkspace from '@/components/ResearchProjects/ProjectWorkspace'
import { getProject } from '@/lib/researchProjects/content'
import { defaultDeps } from '@/lib/researchProjects/deps'
import { getPageAccess } from '@/lib/researchProjects/pageAccess'

// No generateStaticParams and no generateMetadata: the page is rendered per request and its metadata
// is the generic layout metadata, so project content cannot leak through static output or metadata.
export const dynamic = 'force-dynamic'

export default async function ProjectPage({ params }) {
  const { slug } = await params
  const access = await getPageAccess(defaultDeps())
  // The same notice is shown for every slug until access passes, so existence is not revealed.
  if (!access.ok) return <AccessNotice status={access.status} />
  const project = getProject(slug)
  if (!project) notFound()
  return <ProjectWorkspace project={project} role={access.role} viewer={access.viewer} classIds={access.classIds} />
}
