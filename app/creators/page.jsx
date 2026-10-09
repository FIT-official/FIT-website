import CreatorsDirectory from './CreatorsDirectory'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { creatorDirectoryParams, getPublicCreators } from '@/lib/seo/creators'
import { absoluteUrl } from '@/lib/seo/site'
import { jsonLdString } from '@/lib/jsonLd'
import { notFound } from 'next/navigation'
import { cache } from 'react'

export const dynamic = 'force-dynamic'
const getDirectory = cache(async (page, q) => {
    const data = await getPublicCreators({ page, q })
    if (data.page > 1 && !data.creators.length) notFound()
    return data
})

export async function generateMetadata({ searchParams } = {}) {
    const { page, q } = creatorDirectoryParams(await searchParams)
    if (page > 1) await getDirectory(page, q)
    const path = page > 1 ? `/creators?page=${page}` : '/creators'
    return buildPageMetadata({
        title: `3D Printing Creators & Designer Shops${page > 1 ? ` | Page ${page}` : ''} | Fix It Today`,
        description: 'Browse independent designers and print shops on Fix It Today. Explore their products, creator pages and custom printing services.',
        path,
        ...(q ? { robots: { index: false, follow: true } } : {}),
    })
}

export default async function CreatorsPage({ searchParams } = {}) {
    const { page, q } = creatorDirectoryParams(await searchParams)
    const initialData = await getDirectory(page, q)
    const url = absoluteUrl(initialData.page > 1 ? `/creators?page=${initialData.page}` : '/creators')
    const schema = {
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        name: 'Meet the makers', url,
        mainEntity: {
            '@type': 'ItemList', itemListElement: initialData.creators.map((creator, index) => ({
                '@type': 'ListItem', position: (initialData.page - 1) * initialData.pageSize + index + 1,
                name: creator.displayName, url: absoluteUrl(`/creators/${encodeURIComponent(creator.slug)}`),
            })),
        },
    }
    return <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(schema) }} />
        <CreatorsDirectory key={`${initialData.page}:${initialData.q}`} initialData={initialData} />
    </>
}
