import Image from 'next/image'
import Link from 'next/link'
import { realImageSrc } from '@/lib/home/content'
import { siteFacts } from '@/lib/home/siteFacts'
import HeroVideo from './HeroVideo'
import styles from './home.module.css'

export default function Hero({ content, facts = siteFacts }) {
    const poster = realImageSrc(content?.heroImage)
    return <section className={styles.hero} aria-labelledby="home-title">
        {poster && <Image src={poster} alt="The Fix It Today team and community gathered for a group photo" fill priority fetchPriority="high"
            sizes="(max-width: 767px) 100vw, (max-width: 1023px) 90vw, (max-width: 1588px) 85vw, 1350px" className={styles.heroImage} />}
        {facts.heroVideo && <HeroVideo src={facts.heroVideo} poster={poster || undefined} className={styles.heroImage} />}
        <div className={styles.heroShade} />
        <div className={styles.heroContent}>
            <p className={styles.eyebrow}>FIX IT TODAY®</p>
            <h1 id="home-title">Print, fix and build in Singapore</h1>
            <p className={styles.heroPromise}>3D printing, printer repair and filament — self-collection or delivery across Singapore.</p>
            <div className={styles.heroActions}>
                <Link href="/prints/request" className={styles.heroPrimary}><span>Get a print quote <span aria-hidden="true">↗</span></span><small>Upload 3MF / STL</small></Link>
                <Link href="/printer-repair" className={styles.heroSecondary}>Book a repair <span aria-hidden="true">↗</span></Link>
                <Link href="/shop?productCategory=Filament" className={styles.heroSecondary}>Shop filament <span aria-hidden="true">↗</span></Link>
            </div>
            <Link href="/shop/bulk-filament" className={styles.heroBulk}>Bulk filament for schools <span aria-hidden="true">→</span></Link>
        </div>
    </section>
}
