import ProgrammeLayout, { programmeMetadata, Photo, SectionHeading, TextLink, WorkshopList, Questions, ReadingList, styles } from '@/components/Programmes/ProgrammeLayout'
import ProjectGallery from '@/components/Programmes/ProjectGallery'
import { schoolGalleryPhotos, teachingPhotos } from '@/components/Programmes/workshopPhotos'

const description = '3D printing, Arduino electronics and robotics workshops for schools in Singapore. Explore practical project ideas and plan a programme for your students.'
const hero = {
    ...teachingPhotos[0],
    caption: 'Nanyang Girls’ High School · A classroom workshop led by FIT.',
    landscape: true,
}
export const metadata = programmeMetadata({ title: 'School STEM, 3D Printing & Robotics | Fix It Today', description, path: '/school-programmes', image: hero.src, imageAlt: hero.alt })

export default function SchoolProgrammes() {
    return <ProgrammeLayout
        title="STEM learning in action." titleLead="STEM learning" titleAccent="in action." eyebrow="School programmes"
        intro="3D printing, electronics and robotics programmes for schools. Bring concepts into the classroom through clear demonstrations, guided practice and projects that students can develop over time."
        hero={hero} topics={['3D design & printing', 'Electronics & code', 'Introductory robotics', 'Project mentoring']}
        path="/school-programmes" serviceType="School STEM programmes and 3D printing workshops"
        enquirySubject="School programme enquiry"
        enquiryDetails={'School:\nStudent age or level:\nNumber of students:\nTopics or project ideas:\nPreferred dates and session length:\nVenue and available equipment:\nBudget:\n'}
    >
        <section className={styles.overview} aria-label="Programme approach">
            <div><p className={styles.eyebrow}>Learn</p><h2>Instruction with purpose</h2><p>Connect each tool and technique to a concept, from dimensional tolerance to the way a sensor controls a response.</p></div>
            <div><p className={styles.eyebrow}>Practise</p><h2>Guidance at the workbench</h2><p>Give students a clear starting point, time to try it themselves and support as they work through a problem.</p></div>
            <div><p className={styles.eyebrow}>Develop</p><h2>A programme that fits</h2><p>Plan the project, materials and session sequence around your students, timetable and available equipment.</p></div>
        </section>
        <section className={styles.section}>
            <div className={styles.story}>
                <Photo {...teachingPhotos[1]} className={styles.storyPhoto} />
                <div className={styles.storyCopy}>
                    <p className={styles.eyebrow}>In the classroom / NYGH</p>
                    <h2>From a shared lesson<br />to individual understanding.</h2>
                    <p>At Nanyang Girls’ High School, FIT led classroom teaching and supported students as they developed their designs. Whole-class explanations gave way to discussion and guidance around the table.</p>
                    <p>The school’s escape room project brought together model making, printed mechanisms and interactive elements. Students measured, assembled and tested their ideas, connecting design decisions to the way a physical part works.</p>
                    <TextLink href="/blog/school-stem-collaborations">Read the workshop story</TextLink>
                </div>
            </div>
            <div className={styles.supportNote}>
                <p className={styles.eyebrow}>MIC support</p>
                <p>We also supported the Materials Innovation Challenge (MIC) through workshops and training for its facilitators.</p>
            </div>
        </section>

        <section id="projects" className={`${styles.section} ${styles.programmeGrid}`}>
            <div className={styles.programmeAside}>
                <SectionHeading eyebrow="Programme pathways" title="Skills that grow with your students.">Choose a starting point. We’ll match the tools, coding support and build complexity to the students’ age and experience.</SectionHeading>
                <Photo src="/images/collaborations/nygh-model-planning.jpg" width={960} height={1280}
                    alt="NYGH students working together to plan and measure a model panel"
                    caption="NYGH · Students applying measurement and planning to their model." />
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
        <ProjectGallery photos={schoolGalleryPhotos} title="Inside the learning experience."
            intro="Classroom teaching, small-group guidance and practical work at NYGH, followed by photographs from our miniature escape room build. Select an album to explore each setting." />
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
