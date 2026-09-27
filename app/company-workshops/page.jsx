import Link from 'next/link'
import ProgrammeLayout, { programmeMetadata, sectionClass, cardClass, paragraphClass, textLinkClass } from '@/components/Programmes/ProgrammeLayout'

const description = 'Plan a company 3D printing, CAD or introductory robotics workshop in Singapore. Learn through a practical team project, or request a prototype print.'
export const metadata = programmeMetadata({ title: 'Company 3D Printing Workshops Singapore | Fix It Today', description, path: '/company-workshops' })

export default function CompanyWorkshops() {
    return (
        <ProgrammeLayout
            title="3D Printing Workshops for Companies"
            intro="Learn how to turn a digital design into a physical part. Plan a practical workshop for your team in Singapore, from a first 3D print to CAD, prototypes and introductory electronics or robotics."
            path="/company-workshops"
            serviceType="Company 3D printing, CAD and introductory robotics workshops"
            enquirySubject="Company workshop enquiry"
            enquiryDetails={'Company:\nNumber of participants:\nExperience with CAD, printing or coding:\nLearning goal or project idea:\nPreferred dates and session length:\nVenue and available equipment:\nBudget:\n'}
        >
            <section id="projects" className={`${sectionClass} scroll-mt-20`}>
                <h2>Choose what your team wants to learn</h2>
                <div className="mt-7 grid gap-5 md:grid-cols-2">
                    <div className={cardClass}>
                        <h3 className="text-lg font-semibold normal-case">A first 3D printing project</h3>
                        <p className={paragraphClass}>For teams new to 3D printing, start with a small desk accessory or personalised part. Work through a simple model, prepare it in a slicer and see how a printer builds it layer by layer.</p>
                        <p className={paragraphClass}>Participants learn why orientation, supports and material choice affect the print, and what to check before starting a job.</p>
                    </div>
                    <div className={cardClass}>
                        <h3 className="text-lg font-semibold normal-case">CAD and practical prototypes</h3>
                        <p className={paragraphClass}>Use a bracket, enclosure or organiser as a design exercise. Explore dimensions, fit and tolerances, then use a prototype to check the design before making another version.</p>
                        <p className={paragraphClass}>Share an example from your team’s work when planning the session. We’ll check whether it suits the workshop tools, materials and available time.</p>
                    </div>
                    <div className={cardClass}>
                        <h3 className="text-lg font-semibold normal-case">Electronics and robotics basics</h3>
                        <p className={paragraphClass}>Build a small sensor project or motorised mechanism to understand how hardware and code work together. Start with reading an input, making a decision in code and controlling an output.</p>
                        <p className={paragraphClass}>This can suit a team learning activity or an introduction to interactive prototypes. The equipment and coding level are agreed before the workshop.</p>
                    </div>
                    <div className={cardClass}>
                        <h3 className="text-lg font-semibold normal-case">Using your workplace 3D printer</h3>
                        <p className={paragraphClass}>Discuss a session around your printer model and typical parts. Topics can include preparing files, selecting filament, first layer checks and recognising common print problems.</p>
                        <p className={paragraphClass}>Send the printer model and your current setup with the enquiry so we can confirm the support available.</p>
                    </div>
                </div>
            </section>
            <section className={sectionClass}>
                <h2>Plan around a useful outcome</h2>
                <ol className="mt-6 grid gap-6 md:grid-cols-3">
                    <li className={cardClass}><p className="text-xs text-lightColor">01</p><h3 className="mt-3 text-base font-semibold normal-case">Choose the task</h3><p className={paragraphClass}>Decide whether the aim is a team activity, a first introduction or a practical design skill. Share the group’s experience and a project idea.</p></li>
                    <li className={cardClass}><p className="text-xs text-lightColor">02</p><h3 className="mt-3 text-base font-semibold normal-case">Agree on the setup</h3><p className={paragraphClass}>Confirm the venue, laptops, software, printers and materials. Print time is planned separately from design time so the session is realistic.</p></li>
                    <li className={cardClass}><p className="text-xs text-lightColor">03</p><h3 className="mt-3 text-base font-semibold normal-case">Build and review</h3><p className={paragraphClass}>Participants make a design or circuit, test it and discuss what worked. The next step might be another prototype or a skill to practise at work.</p></li>
                </ol>
            </section>
            <section className={`${sectionClass} grid gap-8 md:grid-cols-2`}>
                <div>
                    <h2>Need a part printed?</h2>
                    <p className={paragraphClass}>If you already have a 3D model, upload it to get a printing quote. Check the dimensions, material and intended use before ordering. If the model needs design work, include that in your enquiry.</p>
                    <Link href="/prints/request" className={`mt-5 inline-block text-sm ${textLinkClass}`}>Request a 3D print</Link>
                </div>
                <div>
                    <h2>Maintaining a company printer?</h2>
                    <p className={paragraphClass}>For a printer fault or maintenance enquiry, share the make, model, symptoms and photos. We’ll assess the issue and explain the proposed work.</p>
                    <Link href="/blog/3d-printer-repair" className={`mt-5 inline-block text-sm ${textLinkClass}`}>Printer repair and maintenance in Singapore</Link>
                </div>
            </section>
            <section className={sectionClass}>
                <h2>Common planning questions</h2>
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div><h3 className="text-base font-semibold normal-case">Can beginners take part?</h3><p className={paragraphClass}>Yes. A guided design or circuit is a useful starting point. For a group with mixed experience, we can discuss a common task with optional extensions.</p></div>
                    <div><h3 className="text-base font-semibold normal-case">Can the workshop take place at our office?</h3><p className={paragraphClass}>Share the location, room layout and available equipment. We’ll confirm whether the proposed project can be delivered there and what needs to be arranged.</p></div>
                    <div><h3 className="text-base font-semibold normal-case">Will participants take home a print?</h3><p className={paragraphClass}>That depends on the chosen project, class size and printing time. We’ll agree on any included parts and their collection or delivery in the quote.</p></div>
                    <div><h3 className="text-base font-semibold normal-case">How much does a company workshop cost?</h3><p className={paragraphClass}>Pricing depends on participant numbers, duration, preparation, materials and equipment. Share your budget and learning goal so the quote covers the work your team needs.</p></div>
                </div>
            </section>
            <section className={sectionClass}>
                <h2>Guides for your first project</h2>
                <ul className="mt-5 space-y-4 text-sm">
                    <li><Link href="/blog/3d-printing" className={textLinkClass}>How 3D printing works</Link></li>
                    <li><Link href="/blog/fusion-360-cup-holder-workshop-guide" className={textLinkClass}>A Fusion 360 modelling project</Link></li>
                    <li><Link href="/blog/3d-printing-filament-types-guide" className={textLinkClass}>Choosing a 3D printing filament</Link></li>
                    <li><Link href="/blog/arduino-nano-dht11-workshop-guide" className={textLinkClass}>An Arduino temperature and humidity project</Link></li>
                </ul>
            </section>
        </ProgrammeLayout>
    )
}
