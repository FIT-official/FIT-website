import { getHomeHeroContent } from '@/lib/homeHero'
import { getHomeShopPicks, getHomeGuides } from '@/lib/home/data'
import HomeContent from './HomeContent'

export default async function HomeV2({ sections = {} }) {
    const [heroContent, products, posts] = await Promise.all([
        sections.hero === false ? null : getHomeHeroContent(),
        sections.shop === false ? [] : getHomeShopPicks(),
        sections.guides === false ? [] : getHomeGuides(),
    ])
    return <HomeContent sections={sections} heroContent={heroContent} products={products} posts={posts} />
}
