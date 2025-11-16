'use client'
import Link from "next/link"
import { GoChevronRight } from "react-icons/go"
import { useContent } from '@/utils/useContent'
import MarkdownRenderer from '@/components/General/MarkdownRenderer'
import CTALink from "@/components/General/CTALink"

function IntroductionSection() {
    const { content } = useContent('about/introduction', {
        heading: 'Turning Ideas into Reality, One Print at a Time.',
        subheading: 'Join us as a creator',
        description: 'We are one of Singapore\'s most reliable 3D printing & tech repair hub. We aim to empower creators through accessible 3D printing solutions'
    })

    return (
        <div className="pt-4 md:pt-12 flex flex-col items-center justify-center gap-6 px-8 md:px-12">
            <CTALink tag="New" text={content.subheading} url="/creator" />
            <h1 className="flex w-full md:w-md text-center">
                {content.heading}
            </h1>
            <MarkdownRenderer
                source={content.description}
                className="flex text-xs text-center w-3/4 md:w-2/5 items-center justify-center"
            />
        </div>
    )
}

export default IntroductionSection
