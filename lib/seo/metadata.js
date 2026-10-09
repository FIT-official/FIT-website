import { absoluteUrl } from '@/lib/seo/site'

// Public pages share URL and social-preview conventions while keeping their own subject.
export function buildPageMetadata({ title, description, path, image = '/fitogimage.jpg', imageAlt, type = 'website', robots }) {
    const url = absoluteUrl(path)
    const imageUrl = absoluteUrl(image || '/fitogimage.jpg')
    const images = imageAlt ? [{ url: imageUrl, alt: imageAlt }] : [imageUrl]
    return {
        title,
        description,
        alternates: { canonical: url },
        ...(robots ? { robots } : {}),
        openGraph: { title, description, url, siteName: 'Fix It Today', locale: 'en_SG', type, images },
        twitter: { card: 'summary_large_image', title, description, images: [imageUrl] },
    }
}

export const PRIVATE_PAGE_ROBOTS = {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
}
