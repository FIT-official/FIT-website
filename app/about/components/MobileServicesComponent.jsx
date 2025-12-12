'use client'
import { useContent } from '@/utils/useContent'
import Image from "next/image";

function MobileServicesComponent() {
    const { content } = useContent('about/services-list', {
        services: []
    })

    const services = content.services || []

    // Helper function to get image src with proxy support
    const getImageSrc = (imgPath) => {
        if (!imgPath) return '/placeholder.jpg'
        if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('/')) return imgPath
        return `/api/proxy?key=${encodeURIComponent(imgPath)}`
    }

    return (
        <div className="flex w-full flex-col gap-12 py-4">
            {services.map((card, index) => (
                <div
                    key={index}
                    className="flex flex-col w-full aspect-square border-borderColor border rounded-xl bg-baseColor"
                >
                    <div className="relative w-full h-[150px]">
                        <Image
                            src={getImageSrc(card.image)}
                            alt={card.title}
                            fill
                            className="rounded-t-xl object-cover"
                            style={{ objectFit: "cover" }}
                        />
                    </div>
                    <div className="flex flex-col p-8 justify-center">
                        <p className="flex text-lightColor font-semibold uppercase text-xs">Service</p>
                        <h2 className="font-semibold text-lg mb-2">{card.title}</h2>
                        <p className=" font-normal text-pretty text-xs">{card.description}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}

export default MobileServicesComponent