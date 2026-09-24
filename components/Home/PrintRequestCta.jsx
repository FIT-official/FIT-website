'use client'
import Link from 'next/link'
import { GoChevronRight } from 'react-icons/go'
import { useContent } from '@/utils/useContent'

export const PRINT_CTA_DEFAULTS = Object.freeze({
    eyebrow: '3D printing',
    title: 'Get a 3D print made',
    text: 'Upload a model, choose material and colour, and see the price as you go. Nothing is charged until you check out.',
    buttonText: 'Start a print request',
})

// Homepage strip that sends visitors to /prints/request. Copy is editable in
// Admin → Site Content → Home → "Print request strip" (home/print-cta).
export default function PrintRequestCta() {
    const { content } = useContent('home/print-cta', PRINT_CTA_DEFAULTS)
    return (
        <section aria-labelledby="home-print-cta" className="w-full border-b border-borderColor px-8 py-10 md:px-20">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="max-w-2xl">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-lightColor">{content.eyebrow || PRINT_CTA_DEFAULTS.eyebrow}</p>
                    <h2 id="home-print-cta" className="text-2xl font-semibold tracking-tight md:text-3xl">{content.title || PRINT_CTA_DEFAULTS.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-lightColor">{content.text || PRINT_CTA_DEFAULTS.text}</p>
                </div>
                <Link href="/prints/request" className="group inline-flex w-fit shrink-0 items-center gap-2 rounded-lg bg-textColor px-5 py-3 text-sm font-semibold text-background">
                    {content.buttonText || PRINT_CTA_DEFAULTS.buttonText}
                    <GoChevronRight aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
            </div>
        </section>
    )
}
