import ProgrammeLayout, { programmeMetadata, Photo, SectionHeading, TextLink, WorkshopList, Questions, ReadingList, styles } from '@/components/Programmes/ProgrammeLayout'
import ProjectGallery from '@/components/Programmes/ProjectGallery'
import { companyGalleryPhotos, teachingPhotos } from '@/components/Programmes/workshopPhotos'

const description = 'Plan a company 3D printing, CAD or introductory robotics workshop in Singapore. Learn through a practical team project, or request a prototype print.'
const hero = {
    ...teachingPhotos[2],
    caption: 'Our teaching in practice · A FIT session at Nanyang Girls’ High School.',
    landscape: true,
}
export const metadata = programmeMetadata({ title: 'Company 3D Printing Workshops Singapore | Fix It Today', description, path: '/company-workshops', image: hero.src, imageAlt: hero.alt })

export default function CompanyWorkshops() {
    return <ProgrammeLayout
        title="Practical skills. Stronger teams." titleLead="Practical skills." titleAccent="Stronger teams." eyebrow="Company workshops"
        intro="Bring 3D design, printing and electronics into your team’s skill set. Plan an instructor-led workshop around a clear learning goal, with demonstrations, guided practice and a practical challenge."
        hero={hero} topics={['Team workshops', 'CAD & prototyping', 'Electronics & robotics', 'Workplace printer training']}
        path="/company-workshops" serviceType="Company 3D printing, CAD and introductory robotics workshops"
        enquirySubject="Company workshop enquiry"
        enquiryDetails={'Company:\nNumber of participants:\nExperience with CAD, printing or coding:\nLearning goal or project idea:\nPreferred dates and session length:\nVenue and available equipment:\nBudget:\n'}
    >
        <section className={styles.overview} aria-label="Workshop approach">
            <div><p className={styles.eyebrow}>Team development</p><h2>Learn through a shared task</h2><p>Work through a design brief together, compare decisions and test a physical result.</p></div>
            <div><p className={styles.eyebrow}>Technical skills</p><h2>Build practical confidence</h2><p>Explore CAD, print preparation or electronics through guided exercises matched to the group’s experience.</p></div>
            <div><p className={styles.eyebrow}>Workplace application</p><h2>Bring a useful problem</h2><p>Discuss a prototype or your workplace printer setup so we can agree on a relevant training scope.</p></div>
        </section>

        <section id="projects" className={`${styles.section} ${styles.programmeGrid}`}>
            <div className={styles.programmeAside}>
                <SectionHeading eyebrow="Workshop pathways" title="Training with a clear outcome.">A first introduction, a skill for the workplace or a prototype to improve. Choose what your team would like to learn.</SectionHeading>
                <Photo {...teachingPhotos[1]} caption="Small-group guidance during our NYGH school programme." />
            </div>
            <WorkshopList items={[
                { title: 'Your first 3D print', description: 'Design a small desk accessory or personalised part. Prepare the model in a slicer and see how a printer turns it into layers.', concepts: 'Explore orientation, supports and material choice.' },
                { title: 'CAD with a purpose', description: 'Use a bracket, enclosure or organiser to practise dimensions and fit. Bring an idea from your team’s work; we’ll check its suitability before the session.', concepts: 'Learn how clearance and tolerances affect a working prototype.', href: '/blog/fusion-360-cup-holder-workshop-guide', link: 'See a practical CAD exercise' },
                { title: 'Electronics & robotics', description: 'Build a small sensor project or motorised mechanism. Read an input, make a decision in code and control an output.', concepts: 'Equipment and coding level are matched to the group.' },
                { title: 'Know your workplace printer', description: 'Work through file preparation, filament selection, first layer checks and common printing problems. Send us your printer model and typical parts when enquiring.', concepts: 'Training scope is agreed around your actual setup.' },
            ]} />
        </section>

        <section className={`${styles.section} ${styles.challenge}`}>
            <div>
                <SectionHeading eyebrow="An example workshop brief" title="A better home for that cable.">A cable guide is a simple starting point for a real design conversation. Does it fit the desk? Does the cable move freely? What would make it better?</SectionHeading>
                <TextLink href="#enquire">Plan a challenge for your team</TextLink>
            </div>
            <ol className={styles.challengeSteps}>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>01</span><div><h3>Measure the need</h3><p>Check the desk edge and cable diameter. Turn the observations into dimensions for a small guide.</p></div></li>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>02</span><div><h3>Make a first version</h3><p>Model the part and consider its print direction. The orientation of the layers affects how a loaded part can fail.</p></div></li>
                <li className={styles.challengeStep}><span className={styles.rowNumber}>03</span><div><h3>Test the fit</h3><p>Check the clearance, adjust one dimension and compare versions. Use the prototype to explain the next design decision.</p></div></li>
            </ol>
        </section>

        <section className={styles.section}>
            <SectionHeading eyebrow="Built around your team" title="A little planning. A better workshop." />
            <div className={styles.formats}>
                <div><span className={styles.eyebrow}>01 / The goal</span><h3>Choose the outcome</h3><p>A team activity, an introduction to making or a practical design skill. We start with your group’s experience and what you want to learn.</p></div>
                <div><span className={styles.eyebrow}>02 / The setup</span><h3>Agree on the details</h3><p>Venue, laptops, software, printers and materials. We plan printing time separately from design time so the session is realistic.</p></div>
                <div><span className={styles.eyebrow}>03 / The session</span><h3>Build, test, discuss</h3><p>Make a design or circuit, see what works and review it together. Leave with a clearer understanding of the next step.</p></div>
            </div>
        </section>
        <ProjectGallery photos={companyGalleryPhotos} title="Teaching, making and testing."
            intro="Our teaching approach in action at NYGH, alongside our miniature escape room build. These photographs show school teaching and project work; company sessions are planned around your team’s brief." />
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
