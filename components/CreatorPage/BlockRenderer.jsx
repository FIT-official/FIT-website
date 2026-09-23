'use client'
// Renders a creator page's blocks top to bottom. Used by the public
// /creators/[id] page and, with `preview`, by the /dashboard/shop builder so
// what the owner sees while editing is exactly what visitors get.
//
// Props:
//   blocks   — validated `{ id, type, settings }` list (falls back to DEFAULT_BLOCKS)
//   creator  — { id, displayName, imageUrl, role, joinedYear, shop }
//   products — the creator's visible products (already fetched)
//   preview  — true inside the builder (inert Message button)
import { DEFAULT_BLOCKS } from '@/lib/creatorPage/blocks'
import HeroBlock from './blocks/HeroBlock'
import TextBlock from './blocks/TextBlock'
import GalleryBlock from './blocks/GalleryBlock'
import ProductsBlock from './blocks/ProductsBlock'
import PrintServiceBlock from './blocks/PrintServiceBlock'
import LinksBlock from './blocks/LinksBlock'
import ContactBlock from './blocks/ContactBlock'
import FabricationServiceBlock from '@/components/Fabrication/FabricationServiceBlock'

export const BLOCK_COMPONENTS = {
    hero: HeroBlock,
    text: TextBlock,
    gallery: GalleryBlock,
    products: ProductsBlock,
    printService: PrintServiceBlock,
    links: LinksBlock,
    contact: ContactBlock,
}

export const resolveBlocks = (blocks) => (Array.isArray(blocks) && blocks.length > 0 ? blocks : DEFAULT_BLOCKS)

export default function BlockRenderer({ blocks, creator, products = [], preview = false, className = '' }) {
    const list = resolveBlocks(blocks)
    return (
        <div className={`flex flex-col gap-8 ${className}`}>
            {list.map((block, i) => {
                const Component = BLOCK_COMPONENTS[block?.type]
                if (!Component) return null
                return (
                    <section key={block.id || `${block.type}-${i}`} data-block-type={block.type} data-block-id={block.id}>
                        <Component settings={block.settings || {}} creator={creator} products={products} preview={preview} />
                    </section>
                )
            })}
            <FabricationServiceBlock creator={creator} />
        </div>
    )
}
