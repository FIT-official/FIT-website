import Image from 'next/image'
import Link from 'next/link'
import { siteFacts } from '@/lib/home/siteFacts'
import { selectShopPicks } from '@/lib/home/content'
import { miniatureEscapeRoomPhoto } from '@/components/Programmes/finishedProjectPhotos'
import ArticleCards from '@/components/Home/ArticleCards'
import SubscribeForm from '@/components/General/SubscribeForm'
import Hero from './Hero'
import BulkCalculator from './BulkCalculator'
import Faq from './Faq'
import { VisitPickup, LocalBusinessSchema, GoogleRating, Reviews, ClientLogos, WhatsAppButton } from './FactSections'
import styles from './home.module.css'

const services = [
    { title: 'Print a part', href: '/prints/request', image: '/house.png', alt: 'A colourful 3D printed house model', caption: 'Turn a model into something you can hold.' },
    { title: 'Fix my printer', href: '/printer-repair', image: '/repair.png', alt: 'Fix It Today printer repair and services graphic', caption: 'Tell us your printer model and what needs attention.' },
    { title: 'Buy filament & parts', href: '/shop', image: '/filament.png', alt: 'Coloured filament spools from the Fix It Today shop', caption: 'Materials and electronics for your next build.' },
    { title: 'Workshops & kits', href: '/school-programmes', image: miniatureEscapeRoomPhoto.src, alt: miniatureEscapeRoomPhoto.alt, caption: 'Explore 3D design, electronics and hands-on projects.' },
]

export function ShopPicks({ products = [] }) {
    const picks = selectShopPicks(products)
    if (picks.length < 4) return null
    return <section className={styles.section} aria-labelledby="home-shop">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>For your next build</p><h2 id="home-shop">Shop picks</h2></div><Link href="/shop" className={styles.textLink}>Browse shop <span aria-hidden="true">→</span></Link></div>
        <div className={styles.shopGrid}>{picks.map(product => <Link key={product.slug} href={`/products/${encodeURIComponent(product.slug)}`} className={styles.productCard}>
            <div className={styles.productImage}><Image src={product.homeImage} alt={product.name} fill loading="lazy" sizes="(max-width: 639px) 45vw, (max-width: 1023px) 40vw, 22vw" /></div>
            <div className={styles.cardBody}><h3>{product.name}</h3><span className={styles.cardLink}>View product <span aria-hidden="true">↗</span></span></div>
        </Link>)}</div>
    </section>
}

export default function HomeContent({ sections = {}, heroContent, products = [], posts = [], facts = siteFacts }) {
    const on = name => sections[name] !== false
    return <main className={styles.home}>
        {on('hero') ? <Hero content={heroContent} facts={facts} /> : <h1 className="sr-only">Print, fix and build in Singapore</h1>}
        {on('trust') && <section className={styles.trust} aria-label="Services and delivery">
            <ul><li>3D printer repair</li><li>{facts.selfCollection}</li><li>{facts.deliveryOffer}</li><li>Bulk pricing for schools</li></ul>
            <GoogleRating facts={facts} />
        </section>}
        {on('clientLogos') && <ClientLogos facts={facts} />}
        {on('services') && <section className={styles.section} aria-labelledby="home-services">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>From an idea to a working part</p><h2 id="home-services">What do you need?</h2></div></div>
            <div className={styles.serviceGrid}>{services.map(service => <Link key={service.href} href={service.href} className={styles.serviceCard}>
                <div className={styles.serviceImage}><Image src={service.image} alt={service.alt} fill loading="lazy" sizes="(max-width: 639px) 85vw, (max-width: 1023px) 40vw, 22vw" /></div>
                <div className={styles.cardBody}><h3>{service.title} <span aria-hidden="true">↗</span></h3><p>{service.caption}</p></div>
            </Link>)}</div>
        </section>}
        {on('visit') && <><VisitPickup facts={facts} /><LocalBusinessSchema facts={facts} /></>}
        {on('bulk') && <section className={styles.bulk} aria-labelledby="home-bulk">
            <div className={styles.bulkCopy}><p className={styles.eyebrow}>Stock up for your next project</p><h2 id="home-bulk">Schools & makerspaces: bulk filament</h2>
                <p>Plan an order of Lanbo PLA, Lanbo PETG or Marble & Wood PLA. See quantity pricing, then choose your colours in the bulk form.</p>
                <Link href="/shop/bulk-filament" className={styles.button}>Get a bulk quote <span aria-hidden="true">↗</span></Link>
                <p className={styles.finePrint}>Bambu Lab filaments at list price — all 12 available in the bulk form.</p>
            </div><BulkCalculator />
        </section>}
        {on('shop') && <ShopPicks products={products} />}
        {on('creators') && <section className={styles.creators} aria-labelledby="home-creators"><div><p className={styles.eyebrow}>Made here. Found here.</p><h2 id="home-creators">Shop from local creators</h2><p>Explore the creator marketplace and discover your next project.</p></div><Link href="/creators" className={styles.button}>Meet the creators <span aria-hidden="true">↗</span></Link></section>}
        {on('reviews') && <Reviews facts={facts} />}
        {on('faq') && <Faq facts={facts} />}
        {on('guides') && posts.length > 0 && <section className={styles.guides} aria-label="Guides from the blog"><ArticleCards posts={posts} newestId={posts[0]?._id} /></section>}
        {on('newsletter') && <section className={styles.newsletter} aria-labelledby="home-newsletter"><div><p className={styles.eyebrow}>Stay in the loop</p><h2 id="home-newsletter">Ideas for your inbox</h2><p>Get new articles and updates from the FIT team in your inbox.</p></div><div className={styles.signup}><SubscribeForm /><p className={styles.finePrint}>By subscribing, you consent to receiving marketing emails from Fix It Today. <Link href="/privacy" className={styles.textLink}>Privacy Policy</Link></p></div></section>}
        {on('whatsapp') && <WhatsAppButton facts={facts} />}
    </main>
}
