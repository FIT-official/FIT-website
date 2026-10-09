'use client'

import Image from 'next/image'
import { useState } from 'react'
import { productImageSrc, PRODUCT_IMAGE_PLACEHOLDER } from '@/lib/productImage'

export default function ProductImage({ src, alt, ...props }) {
    const resolved = productImageSrc(src)
    const [failedSource, setFailedSource] = useState(null)
    const display = failedSource === resolved ? PRODUCT_IMAGE_PLACEHOLDER : resolved
    return <Image
        {...props}
        src={display}
        alt={alt}
        // Remote product URLs need no Next.js host allowlist. The fallback also
        // bypasses the optimizer so a failed optimizer cannot break recovery.
        unoptimized={/^https?:\/\//i.test(display) || display === PRODUCT_IMAGE_PLACEHOLDER}
        onError={display === PRODUCT_IMAGE_PLACEHOLDER ? undefined : () => setFailedSource(resolved)}
    />
}
