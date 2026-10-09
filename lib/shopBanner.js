import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '@/lib/s3'

const CACHE_MS = 10 * 60 * 1000
const checks = new Map()

function imageKey(image) {
    if (typeof image !== 'string' || !image.trim()) return null
    const value = image.trim()
    if (value.startsWith('/api/proxy?')) {
        return new URL(value, 'https://local.invalid').searchParams.get('key')
    }
    return value.startsWith('/') || /^https?:\/\//i.test(value) ? null : value
}

async function imageExists(key) {
    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET_NAME
    if (!bucket) return true
    const cacheKey = JSON.stringify([bucket, key])
    const now = Date.now()
    for (const [id, entry] of checks) if (entry.expires <= now) checks.delete(id)
    if (checks.has(cacheKey)) return checks.get(cacheKey).result
    if (checks.size >= 128) checks.delete(checks.keys().next().value)
    const result = (async () => {
        try {
            await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
                abortSignal: AbortSignal.timeout(2000),
            })
            return true
        } catch (error) {
            // Only confirmed missing objects are omitted. Permissions, outages
            // and timeouts must not remove a potentially valid banner.
            const missing = ['NotFound', 'NoSuchKey'].includes(error?.name) ||
                (error?.$metadata?.httpStatusCode === 404 && error?.name !== 'NoSuchBucket')
            return !missing
        }
    })()
    checks.set(cacheKey, { expires: now + CACHE_MS, result })
    return result
}

export async function filterShopBanner(contentPath, data) {
    if (contentPath !== 'shop/banner') return data
    const key = imageKey(data.frontmatter?.bannerImage)
    if (!key || await imageExists(key)) return data
    return { ...data, frontmatter: { ...data.frontmatter, bannerImage: '' } }
}
