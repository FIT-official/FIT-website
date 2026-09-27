import Image from 'next/image'
import Link from 'next/link'
import ProgrammeLayout, { programmeMetadata, sectionClass, cardClass, paragraphClass, textLinkClass } from '@/components/Programmes/ProgrammeLayout'

const title = 'School STEM Programmes in Singapore'
const description = '3D printing, Arduino electronics and robotics workshops for schools in Singapore. Explore practical project ideas and plan a programme for your students.'
export const metadata = programmeMetadata({ title: 'School STEM, 3D Printing & Robotics | Fix It Today', description, path: '/school-programmes' })

export default function SchoolProgrammes() {
    return (
        <ProgrammeLayout
            title={title}
            intro="Give students a project they can design, build and test. Fix It Today helps schools plan 3D printing, electronics and introductory robotics workshops around the students’ age, experience and available lesson time."
            path="/school-programmes"
            serviceType="School STEM programmes and 3D printing workshops"
            enquirySubject="School programme enquiry"
            enquiryDetails={'School:\nStudent age or level:\nNumber of students:\nTopics or project ideas:\nPreferred dates and session length:\nVenue and available equipment:\nBudget:\n'}
        >
            <section id="projects" className={`${sectionClass} scroll-mt-20`}>
                <h2>Projects students can build</h2>
                <p className={paragraphClass}>Choose a starting point below. We can adjust the design task, coding support and build complexity to suit your class.</p>
                <div className="mt-7 grid gap-5 md:grid-cols-2">
                    <div className={cardClass}>
                        <h3 className="text-lg font-semibold normal-case">3D design and printing</h3>
                        <p className={paragraphClass}>Students model a keychain, phone stand or small storage box in Tinkercad. They use dimensions, shapes and clearances to make a design that can be printed and used.</p>
                        <p className={paragraphClass}>The printing lesson connects the digital model to layers, supports and print orientation. Students compare the design with the finished part and decide what to improve.</p>
                        <Link href="/blog/tinkercad-keychain-tutorial" className={`mt-4 inline-block text-sm ${textLinkClass}`}>Try the Tinkercad keychain guide</Link>
                    </div>
                    <div className={cardClass}>
                        <h3 className="text-lg font-semibold normal-case">Arduino and interactive exhibits</h3>
                        <p className={paragraphClass}>Build a temperature display, reaction game or interactive board. Students connect a sensor or button, write a short program and use lights or a display to show the result.</p>
                        <p className={paragraphClass}>The core idea is input, process and output: a sensor measures something, the code makes a decision, and the circuit responds.</p>
                        <Link href="/blog/arduino-nano-dht11-workshop-guide" className={`mt-4 inline-block text-sm ${textLinkClass}`}>Read the Arduino sensor guide</Link>
                    </div>
                    <div className={cardClass}>
                        <h3 className="text-lg font-semibold normal-case">Introduction to robotics</h3>
                        <p className={paragraphClass}>Use sensors, code and motors to explore how a moving device responds to its surroundings. Project options can include an obstacle alert or a simple motorised mechanism.</p>
                        <p className={paragraphClass}>Students learn how sensing and movement work together, then test one change at a time. The robot or mechanism is chosen to match the available equipment and lesson time.</p>
                    </div>
                    <div className={cardClass}>
                        <h3 className="text-lg font-semibold normal-case">Design thinking and prototypes</h3>
                        <p className={paragraphClass}>Start with a problem students can observe, such as storing classroom items or making a display easier to use. Students research the need, sketch possible solutions and build a prototype.</p>
                        <p className={paragraphClass}>Testing gives them evidence for the next version. A longer programme can combine a printed enclosure, electronics and a short presentation explaining the design choices.</p>
                    </div>
                </div>
            </section>
            <section className={`${sectionClass} grid items-center gap-8 md:grid-cols-2`}>
                <div>
                    <h2>Build on real workshop work</h2>
                    <p className={paragraphClass}>Our school work includes 3D printed parts, Arduino circuits and interactive project boards. These projects give students something concrete to test and explain.</p>
                    <p className={paragraphClass}>See examples from our collaboration work, including the school programme at Nanyang Girls’ High School and a separate MIC project.</p>
                    <Link href="/blog/school-stem-collaborations" className={`mt-5 inline-block text-sm ${textLinkClass}`}>See our school and MIC projects</Link>
                </div>
                <figure className="rounded-xl border border-borderColor bg-baseColor p-5">
                    <Image src="/images/collaborations/printed-project-parts.jpg" width={601} height={759} sizes="(max-width: 768px) 90vw, 40vw" alt="3D printed parts and game pieces arranged on a table" className="mx-auto h-auto max-h-80 w-auto max-w-full object-contain rounded-md" />
                    <figcaption className="mt-4 text-center text-xs leading-6 text-lightColor">Printed parts and game pieces from our workshop development.</figcaption>
                </figure>
            </section>
            <section className={sectionClass}>
                <h2>Choose a format that fits your school</h2>
                <div className="mt-6 grid gap-6 md:grid-cols-3">
                    <div><h3 className="text-base font-semibold normal-case">An introductory workshop</h3><p className={paragraphClass}>Focus on one design or circuit. This works well for a first experience of 3D printing or electronics, with a guided build and time to test.</p></div>
                    <div><h3 className="text-base font-semibold normal-case">A series of lessons</h3><p className={paragraphClass}>Give students time to learn the tools, develop a project and improve it after testing. Useful for applied learning, enrichment and CCA activities.</p></div>
                    <div><h3 className="text-base font-semibold normal-case">Project support</h3><p className={paragraphClass}>Discuss support for student prototypes, exhibitions or competition preparation. The project requirements and the students’ existing work guide the scope.</p></div>
                </div>
            </section>
            <section className={sectionClass}>
                <h2>Before the first session</h2>
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div><h3 className="text-base font-semibold normal-case">Do students need prior experience?</h3><p className={paragraphClass}>Beginner sessions can start with guided modelling or simple circuits. Tell us the students’ level and any coding or design experience so we can choose a suitable task.</p></div>
                    <div><h3 className="text-base font-semibold normal-case">Does the school need 3D printers?</h3><p className={paragraphClass}>Let us know which laptops, printers and electronics kits are available. We’ll agree on equipment, materials and any printing needed before or after the session.</p></div>
                    <div><h3 className="text-base font-semibold normal-case">Can every student finish a print during class?</h3><p className={paragraphClass}>Print time depends on the model and the number of printers. We plan demonstrations, shared printing or later collection around the class size and timetable.</p></div>
                    <div><h3 className="text-base font-semibold normal-case">How is the programme priced?</h3><p className={paragraphClass}>The quote depends on the group size, number of sessions, materials, equipment and project support. Share your budget early so we can plan a suitable scope.</p></div>
                </div>
            </section>
            <section className={sectionClass}>
                <h2>Start learning before the workshop</h2>
                <ul className="mt-5 space-y-4 text-sm">
                    <li><Link href="/blog/3d-printing" className={textLinkClass}>An introduction to 3D printing</Link></li>
                    <li><Link href="/blog/tinkercad-toolbox-guide" className={textLinkClass}>Tinkercad tools for beginners</Link></li>
                    <li><Link href="/blog/3d-printing-theory-and-material-properties" className={textLinkClass}>3D printing theory and material properties</Link></li>
                    <li><Link href="/blog/arduino-nano-io-expansion-shield-wiring" className={textLinkClass}>Connecting an Arduino Nano and expansion shield</Link></li>
                </ul>
            </section>
        </ProgrammeLayout>
    )
}
