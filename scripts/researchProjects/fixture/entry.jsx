// Browser entry for the loopback fixture. It mounts the ACTUAL library components (React, CSS modules, KaTeX) on
// data embedded by the fixture server. Only auth and next/link are stubbed elsewhere.
import { createRoot } from 'react-dom/client'
import Library from '@/components/ResearchProjects/Library'
import AccessNotice from '@/components/ResearchProjects/AccessNotice'
import ProjectWorkspace from '@/components/ResearchProjects/ProjectWorkspace'

const data = JSON.parse(document.getElementById('fixture-data').textContent)
const root = createRoot(document.getElementById('root'))

if (data.view === 'notice') root.render(<AccessNotice status={data.status} />)
else if (data.view === 'library') root.render(<Library projects={data.projects} canReview={data.canReview} />)
else {
  root.render(
    <ProjectWorkspace project={data.project} canReview={data.canReview} hasPersonal={data.hasPersonal} viewer={data.viewer} classIds={data.classIds} />,
  )
}
