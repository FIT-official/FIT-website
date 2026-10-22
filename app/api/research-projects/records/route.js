import { handleRecordsGet, handleRecordsPut } from '@/lib/researchProjects/http'
import { defaultDeps } from '@/lib/researchProjects/deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = request => handleRecordsGet(request, defaultDeps(request))
export const PUT = request => handleRecordsPut(request, defaultDeps(request))
