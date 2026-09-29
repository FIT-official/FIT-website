import ProgrammeLayout, { programmeMetadata, Photo, SectionHeading, TextLink, WorkshopList, Questions, ReadingList, styles } from '@/components/Programmes/ProgrammeLayout'
import ProjectGallery from '@/components/Programmes/ProjectGallery'
import { schoolGalleryPhotos, teachingPhotos } from '@/components/Programmes/workshopPhotos'

const description = '3D printing, Arduino electronics and robotics workshops for schools in Singapore. Explore practical project ideas and plan a programme for your students.'
const hero = {
    ...teachingPhotos[0],
    caption: 'A classroom session at Nanyang Girls’ High School',
}
export const metadata = programmeMetadata({ title: 'School STEM & Robotics Workshops Singapore | Fix It Today', description, path: '/school-programmes', image: hero.src, imageAlt: hero.alt })

export default function SchoolProgrammes() {
    return <ProgrammeLayout
        title="School programmes" titleLead="School" titleAccent="programmes"
        intro="We run school STEM workshops in Singapore, teaching 3D design, printing, electronics and introductory robotics through practical work. Sessions range from a first introduction to a term-long project, with time for students to build and test their ideas."
        hero={hero}
        path="/school-programmes" serviceType="School STEM programmes and 3D printing workshops"
        enquirySubject="School programme enquiry"
        enquiryDetails={'School:\nStudent age or level:\nNumber of students:\nTopics or project ideas:\nPreferred dates and session length:\nVenue and available equipment:\nBudget:\n'}
    >
        <section className={styles.section}>
            <div className={styles.story}>
                <Photo {...teachingPhotos[1]} className={styles.storyPhoto} />
                <div className={styles.storyCopy}>
                    <p className={styles.eyebrow}>Nanyang Girls’ High School</p>
                    <h2>Around the table</h2>
                    <p>Our sessions at NYGH included classroom teaching and small-group guidance. Students developed room models, printed mechanisms and interactive elements for an escape room project.</p>
                    <p>They measured panels, assembled parts and checked the fit. We helped them work through the design and understand what to change.</p>
                    <TextLink href="/blog/school-stem-collaborations">The NYGH workshop</TextLink>
                </div>
            </div>
            <div className={styles.supportNote}>
                <p className={styles.eyebrow}>MIC support</p>
                <p>We also supported the Materials Innovation Challenge (MIC) through workshops and training for its facilitators.</p>
            </div>
        </section>

        <section id="projects" className={`${styles.section} ${styles.programmeGrid}`}>
            <div className={styles.programmeAside}>
                <SectionHeading title="What we teach">The starting point depends on the students’ age, experience and the equipment available.</SectionHeading>
                <Photo src="/images/collaborations/nygh-model-planning.jpg" width={960} height={1280}
                    alt="NYGH students working together to plan and measure a model panel"
                    caption="Planning a model at NYGH" />
            </div>
            <WorkshopList items={[
                { title: '3D design & printing', description: 'Model a keychain, phone stand or small box in Tinkercad, then compare the design with a printed part.', concepts: 'Explore dimensions, clearance, layers and print orientation.', href: '/blog/tinkercad-keychain-tutorial', link: 'Try a first modelling project' },
                { title: 'Electronics', description: 'Connect a sensor or button to a light or display. Build a temperature monitor, reaction game or interactive exhibit.', concepts: 'Learn how code uses an input to control an output.', href: '/blog/arduino-nano-dht11-workshop-guide', link: 'An Arduino sensor project' },
                { title: 'Robotics', description: 'Use a sensor and motor to make a device respond to its surroundings. Test when it should move, stop or signal an obstacle.', concepts: 'Connect sensing, thresholds and movement through repeated tests.' },
                { title: 'Project mentoring', description: 'Develop a prototype over several sessions. Projects can combine a printed enclosure, electronics and a presentation of the work.', concepts: 'Use observations and measurements to decide what to change.' },
            ]} />
        </section>

        <section className={`${styles.section} ${styles.challenge}`}>
            <SectionHeading eyebrow="A classroom exercise" title="Will the lid fit?">Design a box and two lids with different clearances. Print them, compare the fit and use the measurements to decide what to change.</SectionHeading>
            <ol className={styles.challengeSteps}>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>01</span><div><h3>Design two versions</h3><p>Keep the box the same. Give two lids slightly different clearances so there is one clear change to investigate.</p></div></li>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>02</span><div><h3>Print, measure, try</h3><p>Compare the digital dimensions with the physical parts. Check whether the lids slide, stick or sit too loosely.</p></div></li>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>03</span><div><h3>Explain the next change</h3><p>Use the fit test to choose a better clearance. Students meet dimensional tolerance through a part they can hold.</p></div></li>
            </ol>
        </section>

        <section className={styles.section}>
            <SectionHeading title="Programme formats" />
            <div className={styles.formats}>
                <div><h3>Single workshops</h3><p>A guided design or circuit, with time to build and test. A first experience of 3D printing or electronics.</p></div>
                <div><h3>Lesson series</h3><p>Learn the tools and develop a project over several sessions, for enrichment, applied learning or CCA activities.</p></div>
                <div><h3>Facilitator support</h3><p>Training and project guidance for the people running a programme, exhibition or competition activity.</p></div>
            </div>
        </section>
        <ProjectGallery photos={schoolGalleryPhotos} title="Workshop photographs"
            intro="Classroom sessions at NYGH and our miniature escape room build." />
        <Questions items={[
            { question: 'Do students need prior experience?', answer: 'Beginner sessions can start with guided modelling or simple circuits. Tell us the students’ level and any coding or design experience so we can choose a suitable task.' },
            { question: 'Does the school need its own equipment?', answer: 'Let us know which laptops, printers and electronics kits are available. We’ll agree on equipment, materials and any printing needed before or after the session.' },
            { question: 'Can every student finish a print during class?', answer: 'Print time depends on the model and the number of printers. We plan demonstrations, shared printing or later collection around the class size and timetable.' },
            { question: 'How is the programme priced?', answer: 'The quote depends on the group size, number of sessions, materials, equipment and project support. Share your budget early so we can plan a suitable scope.' },
        ]} />
        <ReadingList items={[
            { href: '/blog/3d-printing', topic: 'Start here', title: 'How 3D printing works' },
            { href: '/blog/tinkercad-toolbox-guide', topic: 'Design', title: 'Your first Tinkercad tools' },
            { href: '/blog/3d-printing-theory-and-material-properties', topic: 'Materials', title: 'From plastic to a useful part' },
            { href: '/blog/arduino-nano-io-expansion-shield-wiring', topic: 'Electronics', title: 'Connect an Arduino project' },
        ]} />
    </ProgrammeLayout>
}
