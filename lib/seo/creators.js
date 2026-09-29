import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'
import Product from '@/models/Product'
import { escapeRegex, sanitizeDisplayName } from '@/lib/creatorPage/resolveCreator'
import { absoluteUrl } from './site'
import { buildPageMetadata } from './metadata'
import { contentDescription } from './publicContent'
import { NON_PUBLIC_PRODUCT_SLUGS } from '@/lib/productPublicContent'

export function creatorMetadata(creator) {
    if (!creator || creator.shop?.published === false || creator.displayName === 'Unnamed Store') {
        return { title: 'Creator unavailable | Fix It Today', robots: { index: false, follow: false } }
    }
    const hero = creator.shop?.blocks?.find(block => block.type === 'hero')?.settings
    const description = contentDescription(hero?.subheadline || creator.shop?.description)
        || `Browse ${creator.displayName}'s products and creator page on Fix It Today.`
    const image = creator.shop?.logoImage || creator.shop?.bannerImage
    return buildPageMetadata({
        title: `${creator.displayName} | Fix It Today`, description,
        path: `/creators/${encodeURIComponent(creator.displayName)}`,
        image: image ? absoluteUrl(`/api/proxy?key=${encodeURIComponent(image)}`) : '/fitogimage.png',
        imageAlt: creator.displayName,
    })
}

export function creatorDirectoryParams(params = {}) {
    const pageRaw = Number(params.page || 1)
    return {
        page: Number.isSafeInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1,
        q: String(params.q || '').trim().slice(0, 60),
    }
}

export async function getPublicCreators(params = {}) {
    const { page, q } = creatorDirectoryParams(params)
    await connectToDatabase()
    const filter = {
        shop: { $exists: true, $ne: null },
        'shop.published': { $ne: false },
        'metadata.displayName': { $exists: true, $type: 'string', $ne: '' },
    }
    if (q) filter['metadata.displayName'] = { ...filter['metadata.displayName'], $regex: escapeRegex(q), $options: 'i' }
    const users = await User.find(filter, {
        _id: 0, userId: 1, 'metadata.displayName': 1,
        'shop.logoImage': 1, 'shop.bannerImage': 1, 'shop.description': 1, 'shop.accentColor': 1,
    }).lean()
    const namedUsers = users.filter(user => sanitizeDisplayName(user.metadata?.displayName, '') && user.userId)
    const ids = namedUsers.map(user => user.userId)
    const rows = ids.length ? await Product.aggregate([
        { $match: { creatorUserId: { $in: ids }, hidden: { $ne: true }, flaggedForModeration: { $ne: true }, slug: { $nin: NON_PUBLIC_PRODUCT_SLUGS } } },
        { $group: { _id: '$creatorUserId', count: { $sum: 1 } } },
    ]) : []
    const counts = new Map(rows.map(row => [row._id, row.count]))
    const creators = namedUsers.map(user => ({
        userId: user.userId,
        displayName: sanitizeDisplayName(user.metadata.displayName),
        slug: sanitizeDisplayName(user.metadata.displayName),
        logoImage: typeof user.shop?.logoImage === 'string' ? user.shop.logoImage : '',
        bannerImage: typeof user.shop?.bannerImage === 'string' ? user.shop.bannerImage : '',
        description: typeof user.shop?.description === 'string' ? user.shop.description.slice(0, 160) : '',
        accentColor: /^#[0-9a-fA-F]{6}$/.test(user.shop?.accentColor || '') ? user.shop.accentColor : '',
        productCount: counts.get(user.userId) || 0,
    })).sort((a, b) => b.productCount - a.productCount || a.displayName.localeCompare(b.displayName))
    const start = (page - 1) * 20
    return { creators: creators.slice(start, start + 20), page, q, pageSize: 20, total: creators.length, hasMore: start + 20 < creators.length }
}
