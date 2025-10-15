'use client'
import Link from "next/link"
import { GoChevronRight } from "react-icons/go"
import { useContent } from '@/utils/useContent'

function IntroductionSection() {
    const { content } = useContent('about/introduction', {
        heading: 'Turning Ideas into Reality, One Print at a Time.',
        subheading: 'Join us as a creator',
        description: 'We are one of Singapore\'s most reliable 3D printing & tech repair hub. We aim to empower creators through accessible 3D printing solutions'
    })

    return (
        <div className="pt-4 md:pt-12 flex flex-col items-center justify-center gap-6 px-8 md:px-12">
            <Link href='/creator' className="group flex items-center gap-4 p-1 rounded-full border border-borderColor text-xs hover:border-borderColor/50 transition duration-300 ease-out mb-2">
                <div className="justify-between flex gap-4 items-center mask-flare-loop">
                    <span className="py-1 px-2 font-normal rounded-full bg-borderColor transition-colors ease-in-out duration-200" >
                        New
                    </span>
                    <span className="font-medium text-sm">
                        {content.subheading}
                    </span>
                </div>
                <div className="p-1 text-sm rounded-full bg-borderColor">
                    <GoChevronRight />
                </div>
            </Link>
            <h1 className="flex w-full md:w-md text-center">
                {content.heading}
            </h1>
            <p className="flex text-xs text-center w-3/4 md:w-2/5 items-center justify-center">
                {content.description}
            </p>
        </div>
    )
}

export default IntroductionSection
