import Image from 'next/image'
import Link from 'next/link'
import styles from './ProgrammeEvidence.module.css'
import { nyghMiniatureRoomPhoto, photoImageStyle, photoImageSizes } from './finishedProjectPhotos'
export default function SchoolCollaborations() {
    return <section id="school-collaborations" className={styles.section} aria-labelledby="school-collaborations-title">
        <p className={styles.eyebrow}>PROJECTS WITH SINGAPORE SCHOOLS</p><h2 id="school-collaborations-title">Ideas from<br /><em>our schools.</em></h2><p className={styles.intro}>We have worked with Bartley Secondary School, Boon Lay Garden Primary School and Nanyang Girls’ High School. Each school brings a different idea. Here are a few starting points for yours.</p>
        <div className={styles.cards}>
            <article className={styles.bartley}><span className={styles.tag}>SECONDARY / PROJECT BRIEF</span><h3>Bartley Secondary School</h3><h4>An escape room about the school.</h4><p>The Bartley project brief uses familiar school spaces as puzzle stations in a miniature escape room. It brings together model making, 3D printed parts and electronics.</p><div className={styles.flow} aria-label="Project connections"><span>School story</span><span aria-hidden="true">↓</span><span>Puzzle logic</span><span aria-hidden="true">↓</span><span>Physical interaction</span></div><p className={styles.note}>Project planning example: connecting narrative, puzzle logic and a physical response.</p></article>
            <article className={styles.boon}><span className={styles.tag}>PRIMARY / SCHOOL COLLABORATION</span><h3>Boon Lay Garden Primary School</h3><h4>A first project for younger makers.</h4><p>Boon Lay Garden Primary is part of our school programme work. Planning a primary session? Tell us the students’ ages and experience. We can start with simple shapes, a small model or a guided circuit.</p><div className={styles.primaryGraphic} aria-hidden="true"><span>Explore</span><span>Make</span><span>Explain</span></div><a href="#enquire">Discuss a primary programme ↗</a></article>
            <article className={styles.nygh}>
                <span className={styles.tag}>SECONDARY / PROJECT EXAMPLE</span>
                <h3>Nanyang Girls’ High School</h3>
                <figure>
                    <div className={styles.image} style={{ height: 'auto', aspectRatio: nyghMiniatureRoomPhoto.displayRatio }}>
                        <Image src={nyghMiniatureRoomPhoto.src} width={nyghMiniatureRoomPhoto.width} height={nyghMiniatureRoomPhoto.height}
                            sizes={photoImageSizes('(max-width:767px) 90vw, 30vw', nyghMiniatureRoomPhoto.displayZoom)} alt={nyghMiniatureRoomPhoto.alt} style={photoImageStyle(nyghMiniatureRoomPhoto)} />
                    </div>
                    <figcaption style={{ fontSize: '10px', lineHeight: 1.65, marginTop: '10px' }}>{nyghMiniatureRoomPhoto.caption}</figcaption>
                </figure>
                <h4>Room models with moving parts.</h4>
                <p>Students developed room models, printed mechanisms and interactive elements. Measuring panels and checking the fit connect the design on screen to a physical build.</p>
                <Link href="/blog/school-stem-collaborations">Explore the project ↗</Link>
            </article>
        </div>
    </section>
}
