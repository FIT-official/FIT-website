import { handleActionsPost } from '@/lib/researchProjects/http'
import { defaultDeps } from '@/lib/researchProjects/deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = request => handleActionsPost(request, defaultDeps(request))
