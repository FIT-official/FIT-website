import Header from "@/components/General/Header"
import ServicesSection from "./components/ServicesSection"
import BenefitsSection from "./components/BenefitsSection"
import IntroductionSection from "./components/IntroductionSection"
import Link from 'next/link'
import { programmeMetadata } from '@/components/Programmes/ProgrammeLayout'
import ProcurementNote from '@/components/Procurement/ProcurementNote'

export const metadata = programmeMetadata({
    title: 'About FIT | 3D Printing, Fabrication & Workshops Singapore',
    description: 'Fix It Today provides 3D printing, custom metal parts, electronics, printer repair and practical STEM workshops for schools and businesses in Singapore.',
    path: '/about',
})


function About() {
    return (
        <div className='flex w-full flex-col pt-12 border-b border-borderColor'>
            <IntroductionSection />
            <BenefitsSection />
            <Header title="OUR SERVICES" />
            <ServicesSection />
            <ProcurementNote className="border-t border-borderColor px-8 py-12 md:px-20" />
            <section className="border-t border-borderColor px-8 py-12 md:px-20">
                <h2>Custom parts and prototypes</h2>
                <p className="mt-4 max-w-3xl text-sm leading-7">We help with metal fabrication, 3D design, printing and electronics for research and commercial projects. Send us your drawings or let us know what you need.</p>
                <div className="mt-6 flex flex-wrap gap-6 text-sm underline underline-offset-4">
                    <Link href="/research-fabrication">View all services</Link>
                    <Link href="/metal-fabrication">Metal fabrication</Link>
                    <Link href="/3d-design-printing">3D design and printing</Link>
                    <Link href="/electronics-prototyping">Custom electronics</Link>
                </div>
            </section>
            <section className="border-t border-borderColor px-8 py-12 md:px-20">
                <h2>Workshops for schools and companies</h2>
                <p className="mt-4 max-w-3xl text-sm leading-7">Learn 3D design, printing and electronics through a practical project. We can discuss a beginner workshop, a series of school lessons or support for a prototype.</p>
                <div className="mt-6 flex flex-wrap gap-6 text-sm underline underline-offset-4">
                    <Link href="/school-programmes">School programmes</Link>
                    <Link href="/company-workshops">Company workshops</Link>
                    <Link href="/blog/school-stem-collaborations">School workshops and MIC support</Link>
                </div>
            </section>
        </div>
    )
}

export default About
