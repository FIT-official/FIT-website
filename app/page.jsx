import HomeV1 from './HomeV1'
import HomeV2 from '@/components/Home/v2/HomeV2'
import { readHomeFlag, shouldRenderHomeV2 } from '@/lib/home/flags'

export { metadata } from './HomeV1'
export const dynamic = 'force-dynamic'

export default async function Home({ searchParams } = {}) {
    const params = await searchParams
    // An explicit rollback avoids the flag read altogether.
    const values = Array.isArray(params?.home) ? params.home : [params?.home]
    if (values.includes('v1')) return HomeV1()
    const flag = await readHomeFlag()
    return shouldRenderHomeV2(params, flag) ? HomeV2({ sections: flag.sections }) : HomeV1()
}
