import { notFound } from 'next/navigation'
import Classroom from '@/components/Workshop/Classroom'
import { workshopGroupPage } from '@/lib/workshopPages'
export async function generateMetadata({ params }) {
    if (!workshopGroupPage((await params).group)) notFound()
    return { title: 'Earlier student class | Fix It Today', robots: { index: false, follow: false } }
}
export default async function EarlierStudent({ params }) { const { group } = await params; if (!workshopGroupPage(group)) notFound(); return <Classroom homeGroup={group} /> }
