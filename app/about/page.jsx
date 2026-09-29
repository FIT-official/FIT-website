import Header from "@/components/General/Header"
import ServicesSection from "./components/ServicesSection"
import BenefitsSection from "./components/BenefitsSection"
import IntroductionSection from "./components/IntroductionSection"
import Link from 'next/link'
import { programmeMetadata } from '@/components/Programmes/ProgrammeLayout'

export const metadata = programmeMetadata({
    title: 'About Fix It Today | 3D Printing & STEM Workshops Singapore',
    description: '3D printing, school STEM programmes, company workshops and printer support in Singapore. Learn about Fix It Today and plan your next project.',
    path: '/about',
})


function About() {
    return (
        <div className='flex w-full flex-col pt-12 border-b border-borderColor'>
            <IntroductionSection />
            <BenefitsSection />
            <Header title="OUR SERVICES" />
            <ServicesSection />
            <section className="border-t border-borderColor px-8 py-12 md:px-20">
                <h2>Fabrication for research and business</h2>
                <p className="mt-4 max-w-3xl text-sm leading-7">Bring a CAD model, technical drawing or project brief. Discuss metal fabrication, 3D design and printing, or custom electronics for a research or automation prototype.</p>
                <div className="mt-6 flex flex-wrap gap-6 text-sm underline underline-offset-4">
                    <Link href="/research-fabrication">Explore our services</Link>
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
