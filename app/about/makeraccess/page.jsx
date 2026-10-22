import Link from 'next/link'
import Image from 'next/image'
import { buildPageMetadata } from '@/lib/seo/metadata'
import MakerFriends from './MakerFriends'
import styles from './page.module.css'

export const metadata = buildPageMetadata({
    title: 'MakerAccess | Fix It Today',
    description: 'MakerAccess maker supplies, numbered item guides, 3D printing and electronics projects, feedback and contact links.',
    path: '/about/makeraccess',
})

const guides = [
    { topic: '3D printing', title: 'Your first P1S print', href: '/blog/makeraccess-bambu-p1s-printing-guide', image: 'bambu-build-plate.webp', alt: 'Bambu P1S build plate from the printing guide', width: 1000, height: 1000, tone: 'mint', crop: true },
    { topic: 'Electronics', title: 'Small circuits. Real projects.', href: '/blog/makeraccess-sensor-projects', image: 'sensor-servo-circuit.webp', alt: 'Arduino, breadboard and servo circuit from Sensor Projects', width: 240, height: 182, tone: 'peach' },
    { topic: '3D pen', title: 'Draw it in 3D', href: '/blog/makeraccess-3d-pen-starter-guide', image: '3d-pen-form.webp', alt: 'Joining a blue 3D pen form in the starter guide', width: 1000, height: 666, tone: 'lavender', crop: true },
    { topic: 'Project ideas', title: 'Find your next little build', href: '/blog/makeraccess-maker-ideas-library', image: 'maker-bag-tags.webp', alt: 'Colourful bag tags from the Maker Ideas Library', width: 240, height: 240, tone: 'butter' },
]

function Arrow() { return <span aria-hidden="true">↗</span> }

export default function MakerAccessPage() {
    return <main className={styles.page}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <Link href="/about">About FIT</Link><span aria-hidden="true">/</span><span aria-current="page">MakerAccess</span>
        </nav>
        <header className={styles.hero}>
            <div>
                <p className={styles.eyebrow}><span className={styles.statusDot} aria-hidden="true" />Maker kits &amp; parts</p>
                <h1 aria-label="MakerAccess">Maker<span>Access<span className={styles.titleStar} aria-hidden="true">✳</span></span></h1>
                <p className={styles.intro}>A pilot vending service for makerspace supplies. Find your item, then follow its project guide.</p>
                <div className={styles.heroActions}>
                    <Link href="/blog/maker-access-projects" className={styles.button}>Find your item guide <Arrow /></Link>
                    <a href="#using-makeraccess" className={styles.quietLink}>How it works <span aria-hidden="true">↓</span></a>
                </div>
            </div>
            <div className={styles.artboard}>
                <span className={styles.orbit} aria-hidden="true" />
                <MakerFriends />
                <div className={styles.itemSticker}><Image src="/makeraccess/toast-clicker.webp" width={164} height={164} alt="Smiling toast-shaped clicker from the item guide" priority /><span>Meet the toast clicker <span aria-hidden="true">↗</span></span><Link href="/blog/makeraccess-toast-fidget-clicker" aria-label="Open the toast-shaped clicker guide" className={styles.stickerLink} /></div>
                <span className={styles.artLabel}>A little circuit of friends <span aria-hidden="true">♡</span></span>
            </div>
        </header>

        <section id="using-makeraccess" className={styles.section} aria-labelledby="using-heading">
            <div className={styles.sectionIntro}>
                <h2 id="using-heading">From item<br /> to project<span aria-hidden="true"> ↘</span></h2>
                <p>Check the machine for stock and prices.</p>
            </div>
            <ol role="list" className={styles.steps}>
                <li><span aria-hidden="true" className={styles.number}>01</span><div><h3>Find your item</h3><p>Match its number in <Link href="/blog/maker-access-projects">Project Guides</Link>.</p></div></li>
                <li><span aria-hidden="true" className={styles.number}>02</span><div><h3>Use the machine</h3><p>Follow its selection, payment and collection instructions.</p></div></li>
                <li><span aria-hidden="true" className={styles.number}>03</span><div><h3>Get making</h3><p>Open the guide for steps, concepts and any extra parts.</p></div></li>
            </ol>
        </section>

        <section className={styles.section} aria-labelledby="guides-heading">
            <div className={styles.sectionIntro}>
                <p className={styles.eyebrow}>The project shelf</p>
                <h2 id="guides-heading">What will you make?</h2>
                <p>Build steps, useful concepts, less guesswork.</p>
            </div>
            <div className={styles.guides}>{guides.map(guide => <Link key={guide.href} href={guide.href} className={styles.guide}>
                <span className={`${styles.guideImage} ${styles[guide.tone]} ${guide.crop ? styles.crop : ''}`}><Image src={`/makeraccess/${guide.image}`} width={guide.width} height={guide.height} alt={guide.alt} sizes="(max-width: 767px) 43vw, (max-width: 1100px) 40vw, 260px" /><span className={styles.roundArrow}><Arrow /></span></span>
                <span className={styles.guideCopy}><span className={styles.eyebrow}>{guide.topic}</span><h3>{guide.title}</h3></span>
            </Link>)}</div>
        </section>

        <section className={styles.section} aria-labelledby="help-heading">
            <div className={styles.sectionIntro}>
                <p className={styles.eyebrow}>Keep in touch</p>
                <h2 id="help-heading">Got a thought?</h2>
            </div>
            <div className={styles.resources}>
                <a href="https://forms.office.com/r/1kuzRsFGHz"><span><strong>Product feedback</strong><span>How did your item go?</span></span><Arrow /></a>
                <a href="https://forms.office.com/r/HPrZ0Mhc6G"><span><strong>MakerAccess survey</strong><span>What would help you make?</span></span><Arrow /></a>
                <a href="https://linktr.ee/makeraccess"><span><strong>Contact and mailing list</strong><span>Choose “Contact us!” or “Join our mailing list for updates!” on Linktree.</span></span><Arrow /></a>
                <a href="https://www.instagram.com/fixittodaysg"><span><strong>Fix It Today on Instagram</strong><span>@fixittodaysg</span></span><Arrow /></a>
            </div>
        </section>
        <footer className={styles.pageFooter}><Link href="/about">About FIT <Arrow /></Link><Link href="/class">FIT Class <Arrow /></Link><a href="https://leewenwei.com">About the Founder <Arrow /></a></footer>
    </main>
}
