import { handleKeysGet } from '@/lib/researchProjects/http'
import { defaultDeps } from '@/lib/researchProjects/deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = request => handleKeysGet(request, defaultDeps())
