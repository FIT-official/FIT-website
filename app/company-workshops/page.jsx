import ProgrammeLayout, { programmeMetadata, Photo, SectionHeading, TextLink, WorkshopList, Questions, ReadingList, styles } from '@/components/Programmes/ProgrammeLayout'
import ProjectGallery from '@/components/Programmes/ProjectGallery'
import { escapeRoomPhotos } from '@/components/Programmes/workshopPhotos'
import LearningOutcomes from '@/components/Programmes/LearningOutcomes'
import PenProgramme from '@/components/Programmes/PenProgramme'
import { threeDPenPhotos, miniatureEscapeRoomPhoto } from '@/components/Programmes/finishedProjectPhotos'

const description = '3D pen, 3D printing, CAD and electronics programmes for company teams and community groups in Singapore. Plan a practical making project with FIT.'
const hero = threeDPenPhotos[0]
export const metadata = programmeMetadata({ title: 'Company 3D Printing Workshops Singapore | Fix It Today', description, path: '/company-workshops', image: hero.src, imageAlt: hero.alt })

export default function CompanyWorkshops() {
    return <ProgrammeLayout
        title="Company workshops" titleLead="Company" titleAccent="workshops"
        intro="Bring your team or community group together to make something. Try a 3D pen model, design a small part for your desk or connect a circuit that responds. Beginners are welcome. Tell us what your group enjoys and we will help you choose a project."
        hero={hero}
        path="/company-workshops" serviceType="Company 3D printing, CAD and introductory robotics workshops"
        enquirySubject="Team or community programme enquiry"
        enquiryDetails={'Company or community group:\nAge range and number of participants:\nExperience with making, CAD, printing or coding:\nLearning goal or project idea:\nPreferred dates and session length:\nVenue and available equipment:\nBudget:\n'}
    >
        <LearningOutcomes company />
        <PenProgramme />
        <section id="projects" className={`${styles.section} ${styles.programmeGrid}`}>
            <div className={styles.programmeAside}>
                <SectionHeading title="What would your group enjoy making?">Choose a first project below, or bring an idea of your own. We will work out what fits your group, venue and time.</SectionHeading>
                <Photo {...miniatureEscapeRoomPhoto} />
            </div>
            <WorkshopList items={[
                { title: '3D pen team & community projects', description: 'Use templates to make the first pieces, then join them into a small model or a display everyone contributes to.', concepts: 'A shared making brief for teams, schools or community groups.', href: '#pen-programmes', link: 'Explore 3D pen programmes', photo: threeDPenPhotos[0] },
                { title: 'Your first 3D print', description: 'Design a small desk accessory or personalised part. Prepare the model in a slicer and see how a printer turns it into layers.', concepts: 'Explore orientation, supports and material choice.' },
                { title: 'CAD & prototyping', description: 'Use a bracket, enclosure or organiser to practise dimensions and fit. Bring an idea from your team’s work; we’ll check its suitability before the session.', concepts: 'Learn how clearance and tolerances affect a working prototype.', href: '/blog/fusion-360-cup-holder-workshop-guide', link: 'A practical CAD exercise' },
                { title: 'Electronics & robotics', description: 'Build a small sensor project or motorised mechanism. Read an input, make a decision in code and control an output.', concepts: 'Equipment and coding level are matched to the group.' },
                { title: 'Printer training', description: 'Work through file preparation, filament selection, first layer checks and common printing problems. Send us your printer model and typical parts when enquiring.', concepts: 'Training scope is agreed around your actual setup.' },
            ]} />
        </section>

        <section className={`${styles.section} ${styles.challenge}`}>
            <div>
                <SectionHeading eyebrow="An example brief" title="The cable guide">Measure a desk edge and a cable, then design a guide to hold it. Test the printed part for fit, movement and strength.</SectionHeading>
                <TextLink href="#enquire">Plan a challenge for your team</TextLink>
            </div>
            <ol className={styles.challengeSteps}>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>01</span><div><h3>Measure the need</h3><p>Check the desk edge and cable diameter. Turn the observations into dimensions for a small guide.</p></div></li>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>02</span><div><h3>Make a first version</h3><p>Model the part and consider its print direction. The orientation of the layers affects how a loaded part can fail.</p></div></li>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>03</span><div><h3>Test the fit</h3><p>Check the clearance, adjust one dimension and compare versions. Use the prototype to explain the next design decision.</p></div></li>
            </ol>
        </section>

        <section className={styles.section}>
            <SectionHeading title="Planning the session" />
            <div className={styles.formats}>
                <div><h3>The brief</h3><p>Tell us about your group’s experience and what you want to learn. We’ll suggest a suitable exercise and scope.</p></div>
                <div><h3>The equipment</h3><p>We agree on the venue, laptops, software and materials. Printing time is planned separately from design time.</p></div>
                <div><h3>The workshop</h3><p>Participants work through a design or circuit with guidance, then test the result and discuss any changes.</p></div>
            </div>
        </section>
        <ProjectGallery photos={[miniatureEscapeRoomPhoto, ...threeDPenPhotos, ...escapeRoomPhotos.filter(photo => /sensor-wiring|button-lights|electronics/.test(photo.src))]} title="A closer look at the projects"
            intro="3D pen models from the EEEAA 30th Anniversary workshop, alongside circuits and controls from the FIT miniature escape-room project." />
        <Questions items={[
            { question: 'Can beginners take part?', answer: 'Yes. A guided design or circuit is a useful starting point. For mixed experience levels, we can discuss a common task with optional extensions.' },
            { question: 'Can you run the workshop at our office?', answer: 'Share the location, room layout and available equipment. We’ll confirm whether the proposed project can be delivered there and what needs to be arranged.' },
            { question: 'Will participants take home a print?', answer: 'That depends on the chosen project, group size and printing time. We’ll agree on any included parts and their collection or delivery in the quote.' },
            { question: 'How much does a company workshop cost?', answer: 'Pricing depends on participant numbers, duration, preparation, materials and equipment. Share your budget and learning goal so the quote covers the work your team needs.' },
        ]} />
        <section className={`${styles.section} ${styles.services}`}>
            <div><h2>Already have a model?</h2><p>Upload it for a printing quote. Check the dimensions, material and intended use before ordering.</p><TextLink href="/prints/request">Request a 3D print</TextLink></div>
            <div><h2>A printer that needs attention?</h2><p>Share the make, model, symptoms and photos. We’ll assess the issue and explain the proposed work.</p><TextLink href="/blog/3d-printer-repair">Printer repair & maintenance</TextLink></div>
        </section>
        <ReadingList items={[
            { href: '/blog/3d-printing', topic: 'The basics', title: 'From a digital model to a print' },
            { href: '/blog/fusion-360-cup-holder-workshop-guide', topic: 'CAD', title: 'Design a part you can use' },
            { href: '/blog/3d-printing-filament-types-guide', topic: 'Materials', title: 'Choose the right filament' },
            { href: '/blog/arduino-nano-dht11-workshop-guide', topic: 'Electronics', title: 'Build a temperature monitor' },
        ]} />
    </ProgrammeLayout>
}
