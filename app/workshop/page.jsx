import Link from 'next/link'
import Image from 'next/image'
import { workshopGroups, workshopGroupPage, assertWorkshopImagesReady } from '@/lib/workshopPages'
import { ClassBrand, ClassIcon, IdeaPal } from '@/components/Workshop/ClassroomDecor'
import design from '@/components/Workshop/ClassroomDesign.module.css'
export const metadata = { title: 'Design-thinking class | Fix It Today', robots: { index: false, follow: false } }
export default function WorkshopHub() {
    assertWorkshopImagesReady()
    return <main className={design.shell}>
        <ClassBrand />
        <header className={design.hero}><div><p className={design.eyebrow}>A space for curious minds</p><h1>Choose your group</h1><p>Explore an idea. Share a helpful thought. Make something better together.</p><Link className="formBlackButton inline-flex mt-5" href="/workshop/entry">Enter class<ClassIcon kind="ARROW" /></Link></div><IdeaPal /></header>
        <p className="mt-4 max-w-3xl">Each group has two ideas, clearer problem statements, reviewed model examples and three short activities. Open your group, compare the ideas and write your answers.</p>
        <p className={design.guidance}>Read both ideas and their discussion drawings. The proposed designs still need testing. Preparation answers save on this browser. Enter the classroom to send feedback and revised ideas to your teacher.</p>
        <div className={design.groupGrid}>{workshopGroups.map(item => {const group=workshopGroupPage(item.id);return <Link key={group.id} href={'/workshop/'+group.id+'/classroom'} className={design.groupCard}>
            <div className={design.groupTitle}><h2>Group {group.number}</h2><ClassIcon kind="ARROW" /></div>
            <div className={design.groupPictures}>{group.models.map((image, index) => <figure key={index} className="min-w-0">
                {image ? <Image src={image.src} width={image.width} height={image.height} alt={image.alt} sizes="(max-width:639px) 43vw, (max-width:1023px) 21vw, 14vw" className="w-full h-auto" /> : <p className="text-sm">Illustration pending review</p>}
                <figcaption className="text-sm mt-2"><strong>Idea {index + 1}</strong><span className="block">{group.ideas[index].title}</span></figcaption>
            </figure>)}</div>
            <p className={design.groupFooter}>Open your group&apos;s activities</p>
        </Link>})}</div>
        <Link className="inline-block underline mt-8" href="/blog/design-thinking-workshop">Read the class guide</Link>
    </main>
}
