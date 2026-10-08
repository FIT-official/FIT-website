import Link from 'next/link'
import Image from 'next/image'
import { workshopGroups, workshopGroupPage, assertWorkshopImagesReady } from '@/lib/workshopPages'
export const metadata = { title: 'Design-thinking workshop | Fix It Today', robots: { index: false, follow: false } }
export default function WorkshopHub() {
    assertWorkshopImagesReady()
    return <main className="px-5 md:px-10 py-12 max-w-6xl mx-auto">
        <p className="text-sm">Friday 9 October 2026 · 30 minutes</p><h1 className="text-3xl md:text-4xl mt-3">Choose your group</h1>
        <p className="mt-4 max-w-3xl">Each group has two ideas, clearer problem statements, reviewed model examples and three short activities. Open your group, compare the ideas and write your answers.</p>
        <p className="mt-3 text-sm">Read both ideas and their discussion drawings. The proposed designs still need testing. Preparation answers save on this browser. Enter the classroom to send feedback and revised ideas to your teacher.</p>
        <Link className="formBlackButton inline-flex mt-4" href="/workshop/classroom">Enter the workshop classroom</Link>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">{workshopGroups.map(item => {const group=workshopGroupPage(item.id);return <Link key={group.id} href={'/workshop/'+group.id+'/classroom'} className="border border-borderColor rounded-xl overflow-hidden hover:bg-baseColor">
            <div className="grid grid-cols-2 gap-2 p-3 items-start">{group.models.map((image, index) => <figure key={index} className="min-w-0">
                {image ? <Image src={image.src} width={image.width} height={image.height} alt={image.alt} sizes="(max-width:639px) 43vw, (max-width:1023px) 21vw, 14vw" className="w-full h-auto" /> : <p className="text-sm">Illustration pending review</p>}
                <figcaption className="text-sm mt-2"><strong>Idea {index + 1}</strong><span className="block">{group.ideas[index].title}</span></figcaption>
            </figure>)}</div>
            <div className="p-5"><h2 className="text-xl">Group {group.number}</h2><p className="mt-2">{group.ideas.map(idea=>idea.title).join(' / ')}</p><p className="mt-3 text-sm underline">Open your group’s activities</p></div>
        </Link>})}</div>
        <Link className="inline-block underline mt-8" href="/blog/design-thinking-workshop">Read the workshop guide</Link>
    </main>
}
