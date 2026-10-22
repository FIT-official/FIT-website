import { handleAssetGet } from '@/lib/researchProjects/http'
import { defaultDeps } from '@/lib/researchProjects/deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Authenticated, manifest-only delivery of lesson diagrams and teaching files (see lib/researchProjects/assets.js).
export const GET = request => handleAssetGet(request, defaultDeps())
