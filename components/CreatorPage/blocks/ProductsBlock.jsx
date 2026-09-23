'use client'
// Products: the creator's product grid. mode 'all' shows the creator's
// featured picks first (in pick order, when any resolve) and then every
// product up to `limit`; mode 'featured' shows only the picks.
import ProductCard from '@/components/ProductCard'
import { SectionHeading } from '../shared'

const productKey = (p) => String(p?._id || p?.id)

export default function ProductsBlock({ settings = {}, creator, products = [] }) {
    const shop = creator?.shop || {}
    const mode = settings.mode === 'featured' ? 'featured' : 'all'
    const limitRaw = Number(settings.limit)
    const limit = Number.isInteger(limitRaw) && limitRaw >= 4 && limitRaw <= 24 ? limitRaw : 24
    const safeProducts = Array.isArray(products) ? products : []
    const featuredIds = Array.isArray(shop.featuredProductIds) ? shop.featuredProductIds : []
    const byId = new Map(safeProducts.map((p) => [productKey(p), p]))
    const featured = featuredIds.map((id) => byId.get(String(id))).filter(Boolean)

    const heading = settings.heading || (mode === 'featured' ? 'Featured' : 'Products')
    const Grid = ({ items, prefix }) => (
        <div className="grid w-full lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
            {items.map((p) => (
                <ProductCard key={`${prefix}-${productKey(p)}`} product={p} />
            ))}
        </div>
    )

    if (mode === 'featured') {
        if (featured.length === 0) return null
        return (
            <div className="flex flex-col gap-4">
                <SectionHeading>{heading}</SectionHeading>
                <Grid items={featured.slice(0, limit)} prefix="featured" />
            </div>
        )
    }

    const all = safeProducts.slice(0, limit)
    return (
        <div className="flex flex-col gap-8">
            {featured.length > 0 && (
                <div className="flex flex-col gap-4">
                    <SectionHeading>Featured</SectionHeading>
                    <Grid items={featured} prefix="featured" />
                </div>
            )}
            <div className="flex flex-col gap-4">
                <SectionHeading>{heading}</SectionHeading>
                {all.length > 0 ? (
                    <Grid items={all} prefix="all" />
                ) : (
                    <div className="flex w-full items-center justify-center border border-borderColor rounded-sm py-16 bg-background">
                        <div className="text-sm text-lightColor">No products found.</div>
                    </div>
                )}
            </div>
        </div>
    )
}
