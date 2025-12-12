'use client'
import Image from "next/image"
import { MdOutlineDiamond, MdOutlinePrecisionManufacturing } from "react-icons/md"
import { CgToolbox } from "react-icons/cg";
import { BsTools } from "react-icons/bs"
import { useContent } from '@/utils/useContent'

const iconMap = {
    'MdOutlinePrecisionManufacturing': MdOutlinePrecisionManufacturing,
    'BsTools': BsTools,
    'MdOutlineDiamond': MdOutlineDiamond,
    'CgToolbox': CgToolbox,
}

function BenefitsSection() {
    const { content } = useContent('about/benefits', {
        backgroundImage: '/image.png',
        benefits: []
    })

    const benefits = content.benefits || []

    // Helper function to get image src with proxy support
    const getImageSrc = (imgPath) => {
        if (!imgPath) return '/image.png'
        if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('/')) return imgPath
        return `/api/proxy?key=${encodeURIComponent(imgPath)}`
    }

    const getIcon = (iconName) => {
        const IconComponent = iconMap[iconName]
        return IconComponent || MdOutlineDiamond
    }

    return (
        <div className="flex w-full justify-center items-center pb-24 pt-12 border-b px-4 md:px-8 border-borderColor">
            <div className="overflow-hidden rounded-2xl drop-shadow-xl w-full max-w-[650px] relative">
                <Image
                    src={getImageSrc(content.backgroundImage)}
                    alt="About Us"
                    fill
                    className="rounded-lg object-cover opacity-20  z-0"
                    priority
                />
                <div className="relative grid z-10 grid-cols-2 grid-rows-2 text-sm">
                    {benefits.slice(0, 4).map((benefit, index) => {
                        const Icon = getIcon(benefit.icon)
                        const borderClasses = [
                            'border-r border-b border-borderColor',
                            'border-b border-borderColor',
                            'border-r border-borderColor',
                            ''
                        ]

                        return (
                            <div
                                key={index}
                                className={`flex flex-col gap-2 p-8 ${borderClasses[index]}`}
                            >
                                <Icon size={24} />
                                <span className="font-semibold">
                                    {benefit.title}
                                </span>
                                <span className="text-xs">
                                    {benefit.description}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default BenefitsSection