import Link from 'next/link'
import Image from 'next/image'
import { workshopGroups, workshopGroupPage } from '@/lib/workshopPages'
export const metadata = { title: 'Design-thinking workshop | Fix It Today', robots: { index: false, follow: false } }
export default function WorkshopHub() {
    return <main className="px-5 md:px-10 py-12 max-w-6xl mx-auto">
        <p className="text-sm">Friday 9 October 2026 · 30 minutes</p><h1 className="text-3xl md:text-4xl mt-3">Choose your group</h1>
        <p className="mt-4 max-w-3xl">Each group has two ideas, clearer problem statements, reviewed model examples and three short activities. Open your group, compare the ideas and write your answers.</p>
        <p className="mt-3 text-sm">Answers save only on this browser and device. Download or print them for your teacher. Use group numbers and keep personal details out.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">{workshopGroups.map(item => {const group=workshopGroupPage(item.id);return <Link key={group.id} href={'/workshop/'+group.id} className="border border-borderColor rounded-xl overflow-hidden hover:bg-baseColor">
            {group.models[0] && <Image src={group.models[0].src} width={group.models[0].width} height={group.models[0].height} alt={group.models[0].alt} sizes="(max-width:639px) 90vw, (max-width:1023px) 45vw, 30vw" className="w-full h-auto" />}
            <div className="p-5"><h2 className="text-xl">Group {group.number}</h2><p className="mt-2">{group.ideas.map(idea=>idea.title).join(' / ')}</p><p className="mt-3 text-sm underline">Open your group’s activities</p></div>
        </Link>})}</div>
        <Link className="inline-block underline mt-8" href="/blog/design-thinking-workshop">Read the workshop guide</Link>
    </main>
}
