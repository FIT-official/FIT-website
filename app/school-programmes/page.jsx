import ProgrammeLayout, { programmeMetadata, Photo, SectionHeading, TextLink, WorkshopList, Questions, ReadingList, styles } from '@/components/Programmes/ProgrammeLayout'
import ProjectGallery from '@/components/Programmes/ProjectGallery'
import { schoolWorkshopPhotos, escapeRoomPhotos } from '@/components/Programmes/workshopPhotos'
import LearningOutcomes from '@/components/Programmes/LearningOutcomes'
import SchoolCollaborations from '@/components/Programmes/SchoolCollaborations'
import PenProgramme from '@/components/Programmes/PenProgramme'
import { threeDPenPhotos, miniatureEscapeRoomPhoto } from '@/components/Programmes/finishedProjectPhotos'

const description = '3D pen, 3D printing, Arduino electronics and robotics workshops for schools in Singapore. Explore practical projects and plan a programme for your students.'
const hero = miniatureEscapeRoomPhoto
// Existing approved project photographs. School-specific photos keep their
// actual attribution; these do not represent Bartley or Boon Lay sessions.
const mechanismPhoto = schoolWorkshopPhotos.find(photo => photo.src.endsWith('/nygh-printed-mechanism.jpg'))
const roomPhoto = schoolWorkshopPhotos.find(photo => photo.src.endsWith('/nygh-room-models.jpg'))
const sensorPhoto = escapeRoomPhotos.find(photo => photo.src.endsWith('/escape-room-sensor-wiring.jpg'))
const circuitPhoto = escapeRoomPhotos.find(photo => photo.src.endsWith('/escape-room-electronics.jpg'))
export const metadata = programmeMetadata({ title: 'School STEM & Robotics Workshops Singapore | Fix It Today', description, path: '/school-programmes', image: hero.src, imageAlt: hero.alt })

export default function SchoolProgrammes() {
    return <ProgrammeLayout
        title="School programmes" titleLead="School" titleAccent="programmes"
        intro="What would your students like to make? Try a 3D pen model, design a first print or build a circuit that lights up. We guide the class through the tricky steps, with time to try things and show what they made. Plan a single workshop or work on a project over several sessions."
        hero={hero}
        path="/school-programmes" serviceType="School STEM programmes and 3D printing workshops"
        enquirySubject="School programme enquiry"
        enquiryDetails={'School:\nStudent age or level:\nNumber of students:\nTopics or project ideas:\nPreferred dates and session length:\nVenue and available equipment:\nBudget:\n'}
    >
        <LearningOutcomes />
        <SchoolCollaborations />
        <PenProgramme school />
        <section className={styles.section}>
            <div className={styles.supportNote}>
                <p className={styles.eyebrow}>MIC support</p>
                <p>We also supported the Materials Innovation Challenge (MIC) through workshops and training for its facilitators.</p>
            </div>
        </section>

        <section id="projects" className={`${styles.section} ${styles.programmeGrid}`}>
            <div className={styles.programmeAside}>
                <SectionHeading title="What we teach">The starting point depends on the students’ age, experience and the equipment available.</SectionHeading>
                <Photo src="/images/collaborations/nygh-printed-mechanism.jpg" width={1080} height={1440}
                    alt="Blue 3D printed gear and mechanism components from the NYGH project"
                    caption="Printed mechanism parts from the NYGH project." />
            </div>
            <WorkshopList items={[
                { title: '3D pen making', description: 'Trace a few shapes and join them into a model. Start with a guided first piece, then add details or make a shared class display.', concepts: 'See how flat pieces connect and what helps a model stand up.', href: '#pen-programmes', link: 'Explore 3D pen programmes', photo: threeDPenPhotos[1] },
                { title: '3D design & printing', description: 'Model a keychain, phone stand or small box in Tinkercad, then compare the design with a printed part.', concepts: 'Explore dimensions, clearance, layers and print orientation.', href: '/blog/tinkercad-keychain-tutorial', link: 'Try a first modelling project', photo: { ...mechanismPhoto, caption: 'Printed mechanism parts from the NYGH project.' } },
                { title: 'Electronics', description: 'Connect a sensor or button to a light or display. Build a temperature monitor, reaction game or interactive exhibit.', concepts: 'Press a button or read a sensor, then see the circuit respond.', href: '/blog/arduino-nano-dht11-workshop-guide', link: 'An Arduino sensor project', photo: { ...circuitPhoto, caption: 'Circuits on the FIT project workbench.' } },
                { title: 'Robotics', description: 'Use a sensor and motor to make a device respond to its surroundings. Test when it should move, stop or signal an obstacle.', concepts: 'Connect sensing, thresholds and movement through repeated tests.', photo: { ...sensorPhoto, caption: 'Connecting a sensor and servo in the FIT build.' } },
                { title: 'Project mentoring', description: 'Develop a prototype over several sessions. Projects can combine a printed enclosure, electronics and a presentation of the work.', concepts: 'Keep the first attempt, make a change and compare the results.', photo: { ...roomPhoto, caption: 'Room models taking shape in the NYGH project.' } },
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
        <ProjectGallery photos={[miniatureEscapeRoomPhoto, ...threeDPenPhotos, ...schoolWorkshopPhotos.filter(photo => /room-models|printed-mechanism/.test(photo.src)), ...escapeRoomPhotos.filter(photo => /sensor-wiring|button-lights|electronics/.test(photo.src))]} title="Models, mechanisms and circuits"
            intro="A FIT miniature escape-room build, 3D pen models from the EEEAA 30th Anniversary workshop, and room models and mechanisms from NYGH. Each photograph names its project." />
        <Questions items={[
            { question: 'Do students need prior experience?', answer: 'Beginner sessions can start with guided modelling or simple circuits. Tell us the students’ level and any coding or design experience so we can choose a suitable task.' },
            { question: 'Does the school need its own equipment?', answer: 'Let us know which laptops, printers and electronics kits are available. We’ll agree on equipment, materials and any printing needed before or after the session.' },
            { question: 'Can every student finish a print during class?', answer: 'Print time depends on the model and the number of printers. We plan demonstrations, shared printing or later collection around the class size and timetable.' },
            { question: 'How is the programme priced?', answer: 'The quote depends on the group size, number of sessions, materials, equipment and project support. Share your budget early so we can plan a suitable scope.' },
        ]} />
        <ReadingList items={[
            { href: '/blog/3d-printing', topic: 'Start here', title: 'How 3D printing works', photo: mechanismPhoto },
            { href: '/blog/tinkercad-toolbox-guide', topic: 'Design', title: 'Your first Tinkercad tools', photo: roomPhoto },
            { href: '/blog/3d-printing-theory-and-material-properties', topic: 'Materials', title: 'From plastic to a useful part', photo: mechanismPhoto },
            { href: '/blog/arduino-nano-io-expansion-shield-wiring', topic: 'Electronics', title: 'Connect an Arduino project', photo: sensorPhoto },
        ]} />
    </ProgrammeLayout>
}
