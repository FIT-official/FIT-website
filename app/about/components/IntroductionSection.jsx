'use client'
import { useContent } from '@/utils/useContent'
import MarkdownRenderer from '@/components/General/MarkdownRenderer'
import CTALink from "@/components/General/CTALink"

function IntroductionSection() {
    const { content } = useContent('about/introduction', {
        heading: '3D Printing, Workshops and Printer Support',
        subheading: 'Join us as a creator',
        description: 'Fix It Today provides 3D printing, school STEM programmes, company workshops and printer repair in Singapore. We help you design parts, build prototypes and learn to use 3D printers and electronics.'
    })

    return (
        <div className="pt-4 md:pt-12 flex flex-col items-center justify-center gap-6 px-8 md:px-12">
            <CTALink tag="New" text={content.subheading} url="/creators/join" />
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
