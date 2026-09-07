import BlogPost from '@/models/BlogPost'

export const BLOG_SORT_INDEX = { publishDate: -1, createdAt: -1 }
let pendingIndex

// Await the index before querying: large HTML documents can exceed Atlas's
// 32 MB blocking-sort limit even when the response projects only card fields.
export async function ensureBlogSortIndex() {
    if (!pendingIndex) {
        pendingIndex = BlogPost.collection.createIndex(BLOG_SORT_INDEX, {
            name: 'blog_public_date_order',
        }).catch((error) => {
            pendingIndex = undefined
            throw error
        })
    }
    await pendingIndex
}
