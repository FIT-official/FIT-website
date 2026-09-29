import ProgrammeLayout, { programmeMetadata, Photo, SectionHeading, TextLink, WorkshopList, Questions, ReadingList, styles } from '@/components/Programmes/ProgrammeLayout'
import ProjectGallery from '@/components/Programmes/ProjectGallery'
import { schoolGalleryPhotos } from '@/components/Programmes/workshopPhotos'

const description = '3D printing, Arduino electronics and robotics workshops for schools in Singapore. Explore practical project ideas and plan a programme for your students.'
const hero = {
    src: '/images/collaborations/nygh-model-measuring.jpg',
    alt: 'NYGH students measuring a panel for their room model, photographed from behind',
    caption: 'At Nanyang Girls’ High School · Measuring the next part of a room model.',
}
export const metadata = programmeMetadata({ title: 'School STEM, 3D Printing & Robotics | Fix It Today', description, path: '/school-programmes', image: hero.src, imageAlt: hero.alt })

export default function SchoolProgrammes() {
    return <ProgrammeLayout
        title="Learning through making." titleLead="Learning through" titleAccent="making." eyebrow="School programmes"
        intro="A sketch becomes a model. A circuit starts to respond. Give students the space to design, build and discover how things work, with a STEM programme shaped around your class."
        hero={hero} topics={['3D design & printing', 'Electronics & code', 'Introductory robotics', 'Project mentoring']}
        path="/school-programmes" serviceType="School STEM programmes and 3D printing workshops"
        enquirySubject="School programme enquiry"
        enquiryDetails={'School:\nStudent age or level:\nNumber of students:\nTopics or project ideas:\nPreferred dates and session length:\nVenue and available equipment:\nBudget:\n'}
    >
        <section className={styles.section}>
            <div className={styles.story}>
                <Photo src="/images/collaborations/nygh-3d-design-workshop.jpg" width={1280} height={960}
                    alt="FIT instructor introducing 3D printing examples at Nanyang Girls’ High School"
                    caption="In the classroom · Exploring what a 3D printer can make." className={styles.storyPhoto} />
                <div className={styles.storyCopy}>
                    <p className={styles.eyebrow}>Inside a school project / NYGH</p>
                    <h2>A small room.<br />Plenty to figure out.</h2>
                    <p>The escape room project at Nanyang Girls’ High School brings model making, printed mechanisms and interactive elements together.</p>
                    <p>Students measure panels, assemble room layouts and check how the parts fit. Each physical model gives them something to test, discuss and improve.</p>
                    <TextLink href="/blog/school-stem-collaborations">Read the workshop story</TextLink>
                </div>
            </div>
            <div className={styles.photoPair}>
                <Photo src="/images/collaborations/nygh-room-models.jpg" alt="White panel room models under construction at NYGH"
                    caption="01 / Build the space. Room models under construction at NYGH." />
                <Photo src="/images/collaborations/nygh-printed-mechanism.jpg" alt="Blue printed mechanism components with gear teeth and circular openings"
                    caption="02 / Work out the movement. Printed mechanism parts from the NYGH project." />
            </div>
            <div className={styles.supportNote}>
                <p className={styles.eyebrow}>MIC support</p>
                <p>We also supported the Materials Innovation Challenge (MIC) through workshops and training for its facilitators.</p>
            </div>
        </section>

        <ProjectGallery photos={schoolGalleryPhotos} title="Small details. Big moments."
            intro="Explore the NYGH classroom sessions, the making of a miniature escape room and the puzzles inside an immersive room. Open a photo for a closer look." />

        <section id="projects" className={`${styles.section} ${styles.programmeGrid}`}>
            <div className={styles.programmeAside}>
                <SectionHeading eyebrow="Choose a starting point" title="What will your class make?">Start with one idea. We’ll match the tools, coding support and build complexity to the students’ age and experience.</SectionHeading>
                <Photo src="/images/collaborations/interactive-stem-board.jpg" width={720} height={1280}
                    alt="Interactive electronics board with a display, distance sensor and illuminated components"
                    caption="An interactive electronics board: sensors, code and a visible response." />
            </div>
            <WorkshopList items={[
                { title: '3D design & printing', description: 'Model a keychain, phone stand or small box in Tinkercad, then compare the design with a printed part.', concepts: 'Explore dimensions, clearance, layers and print orientation.', href: '/blog/tinkercad-keychain-tutorial', link: 'Try a first modelling project' },
                { title: 'Electronics that respond', description: 'Connect a sensor or button to a light or display. Build a temperature monitor, reaction game or interactive exhibit.', concepts: 'Follow the signal: input → decision in code → output.', href: '/blog/arduino-nano-dht11-workshop-guide', link: 'Explore an Arduino sensor project' },
                { title: 'A first step into robotics', description: 'Use a sensor and motor to make a device respond to its surroundings. Test when it should move, stop or signal an obstacle.', concepts: 'Connect sensing, thresholds and movement through repeated tests.' },
                { title: 'Design, prototype, improve', description: 'Take a problem from the classroom, sketch a solution and build a first version. Longer programmes can combine a printed enclosure, electronics and a project presentation.', concepts: 'Use observations and measurements to decide what to change.' },
            ]} />
        </section>

        <section className={`${styles.section} ${styles.challenge}`}>
            <SectionHeading eyebrow="A question worth testing" title="Will the lid fit?">One small box can open up a whole lesson about dimensions, materials and making decisions from evidence.</SectionHeading>
            <ol className={styles.challengeSteps}>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>01</span><div><h3>Design two versions</h3><p>Keep the box the same. Give two lids slightly different clearances so there is one clear change to investigate.</p></div></li>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>02</span><div><h3>Print, measure, try</h3><p>Compare the digital dimensions with the physical parts. Check whether the lids slide, stick or sit too loosely.</p></div></li>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>03</span><div><h3>Explain the next change</h3><p>Use the fit test to choose a better clearance. Students meet dimensional tolerance through a part they can hold.</p></div></li>
            </ol>
        </section>

        <section className={styles.section}>
            <SectionHeading eyebrow="Make it fit the timetable" title="One session, or a project that grows." />
            <div className={styles.formats}>
                <div><span className={styles.eyebrow}>Discover</span><h3>An introductory workshop</h3><p>A guided design or circuit, with time to build and test. A useful first experience of 3D printing or electronics.</p></div>
                <div><span className={styles.eyebrow}>Develop</span><h3>A series of lessons</h3><p>Learn the tools, develop a project and improve it over several sessions. Suitable for enrichment, applied learning and CCA activities.</p></div>
                <div><span className={styles.eyebrow}>Take it further</span><h3>Project & facilitator support</h3><p>Discuss student prototypes, exhibitions, competition preparation or training for the people guiding the programme.</p></div>
            </div>
        </section>
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
