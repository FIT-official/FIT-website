'use client'
// Gallery: up to 8 square photos in a responsive grid. Keys are S3 objects
// under the creator's own shops/<userId>/ prefix (enforced by the API).
import { proxySrc, SectionHeading } from '../shared'

export default function GalleryBlock({ settings = {} }) {
    const images = Array.isArray(settings.images) ? settings.images.slice(0, 8) : []
    if (images.length === 0) return null
    return (
        <div className="flex flex-col gap-4" data-testid="gallery-block">
            <SectionHeading>{settings.heading}</SectionHeading>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {images.map((key, i) => (
                    <div
                        key={`${key}-${i}`}
                        className="relative aspect-square rounded-md overflow-hidden border border-borderColor bg-baseColor"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={proxySrc(key)}
                            alt={settings.heading ? `${settings.heading} ${i + 1}` : `Gallery image ${i + 1}`}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
