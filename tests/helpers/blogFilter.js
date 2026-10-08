// Evaluate the Mongo operators used by blog visibility queries against mixed fixtures.
export function matchesBlogFilter(doc, filter) {
    return Object.entries(filter).every(([key, value]) => {
        if (key === '$or') return value.some(clause => matchesBlogFilter(doc, clause))
        if (value === null) return doc[key] == null
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            return Object.entries(value).every(([op, expected]) => {
                if (op === '$ne') return doc[key] !== expected
                if (op === '$in') return expected.includes(doc[key])
                if (op === '$lte') return doc[key] <= expected
                throw new Error(`Unsupported fixture operator ${op}`)
            })
        }
        return doc[key] === value
    })
}
export const visibilityPosts = [
    { _id: 'public', slug: 'public-guide', title: 'Public guide', status: 'published', published: true },
    { _id: 'legacy', slug: 'legacy-guide', title: 'Legacy guide', published: true },
    ...['unlisted', 'hidden', 'draft'].flatMap(status => [false, true].map(published => ({
        _id: `${status}-${published}`, slug: `${status}-${published}`, title: `${status} confidential`,
        status, published, content: `${status} confidential body`, featured: true, tags: ['sensor'], categories: ['electronics'],
    }))),
]
