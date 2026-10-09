import { getHomeHeroContent } from '@/lib/homeHero'
import { getHomeShopPicks, getHomeGuides } from '@/lib/home/data'
import HomeContent from './HomeContent'
import { fixtureMode } from '@/lib/creatorDashboard/flags'

export default async function HomeV2({ sections = {} }) {
    if (fixtureMode()) {
        const { previewCatalogue } = await import('@/lib/creatorDashboard/preview/catalog');
        return <HomeContent sections={sections} heroContent={{ heroImage: null }} products={previewCatalogue} posts={[]} />;
    }
    const [heroContent, products, posts] = await Promise.all([
        sections.hero === false ? null : getHomeHeroContent(),
        sections.shop === false ? [] : getHomeShopPicks(),
        sections.guides === false ? [] : getHomeGuides(),
    ])
    return <HomeContent sections={sections} heroContent={heroContent} products={products} posts={posts} />
}
