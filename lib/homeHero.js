import { connectToDatabase } from '@/lib/db'
import ContentBlock from '@/models/ContentBlock'
import { getContentByPath } from '@/lib/mdx'

const HERO_PATH = 'home/hero-banner'
const DEFAULT_TEXT = '3D printing and modeling services'

function heroContent(frontmatter) {
    const fields = frontmatter && typeof frontmatter === 'object' && !Array.isArray(frontmatter) ? frontmatter : {}
    const image = typeof fields.heroImage === 'string' ? fields.heroImage.trim() : ''
    const overlay = fields.darkOverlay
    const numericOverlay = typeof overlay === 'string' && overlay.trim() ? Number(overlay) : overlay
    return {
        text: typeof fields.text === 'string' ? fields.text : DEFAULT_TEXT,
        heroImage: image && image.split(/[?#]/)[0] !== '/placeholder.jpg' ? image : null,
        darkOverlay: typeof overlay === 'boolean' ? overlay
            : typeof numericOverlay === 'number' && Number.isFinite(numericOverlay) ? Math.min(80, Math.max(0, numericOverlay)) : false,
    }
}

export async function getHomeHeroContent() {
    let block
    try {
        await connectToDatabase()
        block = await ContentBlock.findOne({ path: HERO_PATH }).select('frontmatter -_id').lean()
    } catch {
        // An unavailable database does not mean its current image was removed.
        // Keep a neutral hero instead of substituting an outdated seed image.
        return heroContent()
    }
    if (block) return heroContent(block.frontmatter)
    return heroContent(getContentByPath(HERO_PATH)?.frontmatter)
}
