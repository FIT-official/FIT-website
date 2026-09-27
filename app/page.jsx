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
            <h2 className="text-2xl md:text-3xl mb-4">3D Printing and Robotics Workshops</h2>
            <p className="text-sm leading-7 max-w-3xl mb-6">Plan a school STEM programme or a company workshop in Singapore. Explore 3D design, Arduino electronics and introductory robotics through a project your group can build and test.</p>
            <div className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
                <Link href="/school-programmes">School STEM programmes</Link>
                <Link href="/company-workshops">Company 3D printing workshops</Link>
                <Link href="/blog/school-stem-collaborations">School and MIC projects</Link>
            </div>
        </section>
    </HomeClient>
}
