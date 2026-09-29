import Link from 'next/link'
import HomeClient from './HomeClient'
import { absoluteUrl } from '@/lib/seo/site'
import { getHomeHeroContent } from '@/lib/homeHero'

export const dynamic = 'force-dynamic'

const title = '3D Printer Repair & Filament Singapore | Fix It Today'
const description = '3D printer repair and maintenance in Singapore for Bambu Lab, Prusa and FDM printers. Shop PLA, PETG and specialty filament, or enquire about 3D printing.'

export const metadata = {
    title, description,
    alternates: { canonical: absoluteUrl('/') },
    openGraph: { title, description, url: absoluteUrl('/'), siteName: 'Fix It Today®', locale: 'en_SG', type: 'website', images: [absoluteUrl('/fitogimage.png')] },
    twitter: { card: 'summary_large_image', title, description, images: [absoluteUrl('/fitogimage.png')] },
}

export default async function Home() {
    const initialHeroContent = await getHomeHeroContent()
    return <HomeClient initialHeroContent={initialHeroContent}>
        <section className="w-full px-8 md:px-20 py-12 border-b border-borderColor">
            <h1 className="text-2xl md:text-3xl mb-4">3D Printer Repair and Filament in Singapore</h1>
            <p className="text-sm max-w-3xl mb-6">Get help with Bambu Lab, Prusa and other FDM printer faults, arrange maintenance, or choose filament for your next print. Repair enquiries can include your printer model, error message, photos and a short video.</p>
            <div className="flex flex-wrap gap-5 text-sm underline">
                <Link href="/blog/3d-printer-repair">Printer repair and maintenance</Link>
                <Link href="/shop">Shop 3D printing filament</Link>
                <Link href="/blog/3d-printing-filament-types-guide">Compare filament materials</Link>
            </div>
        </section>
        <section className="w-full px-8 md:px-20 py-12 border-b border-borderColor">
            <h2 className="text-2xl md:text-3xl mb-4">Custom parts and prototypes</h2>
            <p className="text-sm leading-7 max-w-3xl mb-6">We help with metal fabrication, 3D design, printing and electronics for research and commercial projects. Send us your drawings or let us know what you need.</p>
            <div className="grid gap-5 md:grid-cols-3">
                <Link href="/metal-fabrication" className="rounded-xl border border-borderColor p-5 transition-colors hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                    <h3 className="text-lg mb-3">Metal fabrication</h3>
                    <p className="text-sm leading-6">Metal parts made from your CAD files or drawings using conventional metalworking. Usually 2–6 weeks, depending on the job.</p>
                </Link>
                <Link href="/3d-design-printing" className="rounded-xl border border-borderColor p-5 transition-colors hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                    <h3 className="text-lg mb-3">3D design and printing</h3>
                    <p className="text-sm leading-6">Design a part from your sketch or print an existing model. Suitable for prototypes, enclosures and fixtures.</p>
                </Link>
                <Link href="/electronics-prototyping" className="rounded-xl border border-borderColor p-5 transition-colors hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                    <h3 className="text-lg mb-3">Custom electronics</h3>
                    <p className="text-sm leading-6">Connect sensors, collect data or add controls to a research setup or automation project.</p>
                </Link>
            </div>
            <Link href="/research-fabrication" className="mt-6 inline-block text-sm underline underline-offset-4">View all services</Link>
        </section>
        <section className="w-full px-8 md:px-20 py-12 border-b border-borderColor">
            <h2 className="text-2xl md:text-3xl mb-4">3D Printing and Robotics Workshops</h2>
            <p className="text-sm leading-7 max-w-3xl mb-6">Plan a school STEM programme or a company workshop in Singapore. Explore 3D design, Arduino electronics and introductory robotics through a project your group can build and test.</p>
            <div className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
                <Link href="/school-programmes">School STEM programmes</Link>
                <Link href="/company-workshops">Company 3D printing workshops</Link>
                <Link href="/blog/school-stem-collaborations">School workshops and MIC support</Link>
            </div>
        </section>
    </HomeClient>
}
