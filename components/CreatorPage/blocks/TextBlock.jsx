'use client'
// Text: optional heading + a Markdown body (same renderer as the CMS).
import MarkdownRenderer from '@/components/General/MarkdownRenderer'
import { SectionHeading } from '../shared'

export default function TextBlock({ settings = {} }) {
    const heading = settings.heading || ''
    const body = settings.body || ''
    if (!heading && !body) return null
    return (
        <div className="flex flex-col gap-3">
            <SectionHeading>{heading}</SectionHeading>
            {body && (
                <MarkdownRenderer source={body} className="w-full text-sm text-lightColor text-pretty" />
            )}
        </div>
    )
}
